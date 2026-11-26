import { schema } from "@wishalia/db";
import { isShareLinkActive } from "@wishalia/domain";
import { and, desc, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

import { first, HttpError, notFound, parse, userId } from "../../http.js";
import {
  deviceMarkerCookieName,
  deviceMarkerSetCookie,
  hashToken,
  newToken,
  readCookie,
  readDeviceMarker,
  writeDeviceMarker,
} from "../../tokens.js";
import type { ShareDeps } from "./index.js";
import { SHARE_PATH } from "./lists.js";

type ShareLinkRow = typeof schema.shareLinks.$inferSelect;

const shareLinkInput = z.discriminatedUnion("scope", [
  z.object({
    scope: z.literal("list"),
    listId: z.uuid(),
    audience: z.string().trim().min(1).max(60),
    expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  }),
  z.object({
    scope: z.literal("event"),
    eventId: z.uuid(),
    audience: z.string().trim().min(1).max(60),
    expiresAt: z.iso.datetime({ offset: true }).nullable().default(null),
  }),
]);
const shareLinkParams = z.object({ shareLinkId: z.uuid() });

/** A share link as its owner sees it. The token is never stored, so never listed again. */
function ownerShareLink(row: ShareLinkRow, now: Date) {
  return {
    id: row.id,
    scope: row.scope,
    listId: row.listId,
    eventId: row.eventId,
    audience: row.audience,
    expiresAt: row.expiresAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
    active: isShareLinkActive(row, now),
    createdAt: row.createdAt.toISOString(),
  };
}

/**
 * Routes of the share links, per guest or per group (spec §3): « Lien pour Mamie », « Les
 * cousins ». Creating a link, or saying it was copied, puts the device marker on the owner's
 * device, so that the public view recognises them even without a session.
 */
export const shareLinkRoutes: FastifyPluginAsync<ShareDeps> = async (app, { config, db, now, secret }) => {
  const markDevice = (request: FastifyRequest, reply: FastifyReply) => {
    const existing = readDeviceMarker(
      secret,
      readCookie(request.headers.cookie, deviceMarkerCookieName(config)),
    );
    reply.header(
      "set-cookie",
      deviceMarkerSetCookie(config, writeDeviceMarker(secret, existing, userId(request))),
    );
  };

  app.get("/share-links", async (request) => {
    const rows = await db
      .select()
      .from(schema.shareLinks)
      // The open links of the public lists are the lists' own: their setting turns them on and off
      .where(and(eq(schema.shareLinks.ownerId, userId(request)), isNull(schema.shareLinks.openToken)))
      .orderBy(desc(schema.shareLinks.createdAt));
    const at = now();
    return rows.map((row) => ownerShareLink(row, at));
  });

  /** The token is in the answer, once: the owner copies or sends the URL. */
  app.post("/share-links", async (request, reply) => {
    const input = parse(shareLinkInput, request.body);
    const ownerId = userId(request);
    const at = now();
    const expiresAt = input.expiresAt === null ? null : new Date(input.expiresAt);
    if (expiresAt && expiresAt.getTime() <= at.getTime()) {
      throw new HttpError(400, "invalid_request", {
        issues: [{ path: "expiresAt", message: "must be in the future" }],
      });
    }
    if (input.scope === "list") {
      const [list] = await db
        .select({ id: schema.wishLists.id })
        .from(schema.wishLists)
        .where(
          and(
            eq(schema.wishLists.id, input.listId),
            eq(schema.wishLists.ownerId, ownerId),
            isNull(schema.wishLists.deletedAt),
          ),
        );
      if (!list) throw notFound();
    } else {
      const [event] = await db
        .select({ id: schema.events.id })
        .from(schema.events)
        .where(and(eq(schema.events.id, input.eventId), eq(schema.events.ownerId, ownerId)));
      if (!event) throw notFound();
    }
    const token = newToken();
    const row = first(
      await db
        .insert(schema.shareLinks)
        .values({
          ownerId,
          tokenHash: hashToken(token),
          scope: input.scope,
          listId: input.scope === "list" ? input.listId : null,
          eventId: input.scope === "event" ? input.eventId : null,
          audience: input.audience,
          expiresAt,
        })
        .returning(),
    );
    markDevice(request, reply);
    return reply.status(201).send({
      ...ownerShareLink(row, at),
      token,
      url: new URL(`${SHARE_PATH}${token}`, config.PUBLIC_ORIGIN).toString(),
    });
  });

  /** Revoking is final and idempotent: the guest's link then answers like an unknown one. */
  app.post("/share-links/:shareLinkId/revoke", async (request) => {
    const { shareLinkId } = parse(shareLinkParams, request.params);
    const ownerId = userId(request);
    const at = now();
    const mine = and(
      eq(schema.shareLinks.id, shareLinkId),
      eq(schema.shareLinks.ownerId, ownerId),
      isNull(schema.shareLinks.openToken),
    );
    await db
      .update(schema.shareLinks)
      .set({ revokedAt: at })
      .where(and(mine, isNull(schema.shareLinks.revokedAt)));
    const [row] = await db.select().from(schema.shareLinks).where(mine);
    if (!row) throw notFound();
    return ownerShareLink(row, at);
  });

  /** The owner copied a link from the app: mark this device too (spec §3, owner detection). */
  app.post("/device-marker", async (request, reply) => {
    markDevice(request, reply);
    return reply.status(204).send();
  });
};
