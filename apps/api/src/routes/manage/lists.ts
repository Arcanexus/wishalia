import { schema } from "@wishalia/db";
import { and, asc, count, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { first, HttpError, notFound, parse, userId } from "../../http.js";
import type { Tx } from "../../history.js";
import { imagesOf } from "../../images.js";
import { deleteItems } from "../../removal.js";
import { hashToken, newToken } from "../../tokens.js";
import type { ListDeps } from "./index.js";
import { ownerItem, ownerList } from "./serialize.js";

export const listInput = z.object({ name: z.string().trim().min(1).max(100) });
export const listPatch = z
  .object({
    name: z.string().trim().min(1).max(100),
    position: z.number().int().min(0),
    archived: z.boolean(),
    /** Forced on everyone who opens the list; null lets each person's theme apply. */
    theme: z.enum(["neutral", "christmas"]).nullable(),
    /** How the secret of the contributions without an event lifts (frozen once lifted). */
    revealMode: z.enum(["received", "manual"]),
    /** Private: share links only. Public: the home page's search finds it, anyone may take part. */
    visibility: z.enum(["private", "public"]),
  })
  .partial()
  .strict();
const idParams = z.object({ listId: z.uuid() });
/** `?archived=true` gives the archived lists, to restore or delete them. */
const listsQuery = z.object({ archived: z.enum(["true", "false"]).optional() });

/** A list of the owner that is not deleted: a deleted list answers 404 everywhere. */
const ownedList = (listId: string, ownerId: string) =>
  and(
    eq(schema.wishLists.id, listId),
    eq(schema.wishLists.ownerId, ownerId),
    isNull(schema.wishLists.deletedAt),
  );
/** The list's open items, every one of them, in their new order. */
export const orderInput = z.object({ itemIds: z.array(z.uuid()).min(1).max(1000) }).strict();

/** Who an open link is for, as the guests' page greets them. */
export const OPEN_LINK_AUDIENCE = "tout le monde";

/** Where a guest opens a share link: the public host, then the token. */
export const SHARE_PATH = "/s/";

const openLinkOf = (listId: string) =>
  and(
    eq(schema.shareLinks.listId, listId),
    isNotNull(schema.shareLinks.openToken),
    isNull(schema.shareLinks.revokedAt),
  );

/**
 * Turns a list public or private. Public: it gets an open link, the address the home page's
 * search gives (kept if it has one). Private: its open link is revoked, so that the address stops
 * working at once; the links per guest or group are left as they are.
 */
async function setVisibility(
  tx: Tx,
  list: { id: string; ownerId: string },
  visibility: "private" | "public",
  at: Date,
) {
  if (visibility === "private") {
    await tx.update(schema.shareLinks).set({ revokedAt: at }).where(openLinkOf(list.id));
    return;
  }
  const [open] = await tx
    .select({ id: schema.shareLinks.id })
    .from(schema.shareLinks)
    .where(openLinkOf(list.id));
  if (open) return;
  const token = newToken();
  await tx.insert(schema.shareLinks).values({
    ownerId: list.ownerId,
    tokenHash: hashToken(token),
    openToken: token,
    scope: "list",
    listId: list.id,
    audience: OPEN_LINK_AUDIENCE,
  });
}

export const listRoutes: FastifyPluginAsync<ListDeps> = async (app, { db, now, images, publicOrigin }) => {
  /** List id → the address of its open link, for the public lists among them. */
  const openUrls = async (listIds: string[]) => {
    const urls = new Map<string, string>();
    if (listIds.length === 0) return urls;
    const rows = await db
      .select({ listId: schema.shareLinks.listId, token: schema.shareLinks.openToken })
      .from(schema.shareLinks)
      .where(
        and(
          inArray(schema.shareLinks.listId, listIds),
          isNotNull(schema.shareLinks.openToken),
          isNull(schema.shareLinks.revokedAt),
        ),
      );
    for (const row of rows) {
      if (row.listId && row.token)
        urls.set(row.listId, new URL(`${SHARE_PATH}${row.token}`, publicOrigin).toString());
    }
    return urls;
  };

  /**
   * The owner's lists, in their order, with the number of open items; with `?archived=true`, the
   * archived ones instead (never the deleted ones).
   */
  app.get("/lists", async (request) => {
    const ownerId = userId(request);
    const { archived } = parse(listsQuery, request.query);
    const rows = await db
      .select({ list: schema.wishLists, items: count(schema.wishes.id) })
      .from(schema.wishLists)
      .leftJoin(
        schema.wishes,
        and(eq(schema.wishes.listId, schema.wishLists.id), eq(schema.wishes.status, "open")),
      )
      .where(
        and(
          eq(schema.wishLists.ownerId, ownerId),
          archived === "true"
            ? and(isNotNull(schema.wishLists.archivedAt), isNull(schema.wishLists.deletedAt))
            : isNull(schema.wishLists.archivedAt),
        ),
      )
      .groupBy(schema.wishLists.id)
      .orderBy(asc(schema.wishLists.position), asc(schema.wishLists.createdAt));
    const urls = await openUrls(
      rows.filter((row) => row.list.visibility === "public").map((row) => row.list.id),
    );
    return rows.map((row) => ownerList(row.list, row.items, urls.get(row.list.id) ?? null));
  });

  app.post("/lists", async (request, reply) => {
    const { name } = parse(listInput, request.body);
    const ownerId = userId(request);
    const list = first(
      await db
        .insert(schema.wishLists)
        .values({
          ownerId,
          name,
          position: sql`(SELECT coalesce(max(${schema.wishLists.position}) + 1, 0) FROM ${schema.wishLists} WHERE ${schema.wishLists.ownerId} = ${ownerId})`,
        })
        .returning(),
    );
    return reply.status(201).send(ownerList(list, 0, null));
  });

  app.patch("/lists/:listId", async (request) => {
    const { listId } = parse(idParams, request.params);
    const patch = parse(listPatch, request.body);
    const mine = ownedList(listId, userId(request));
    if (patch.revealMode !== undefined) {
      const [before] = await db.select().from(schema.wishLists).where(mine);
      if (!before) throw notFound();
      if (before.revealedAt && patch.revealMode !== before.revealMode) {
        throw new HttpError(409, "secret_already_lifted");
      }
    }
    const list = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(schema.wishLists)
        .set({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.position !== undefined ? { position: patch.position } : {}),
          ...(patch.archived !== undefined ? { archivedAt: patch.archived ? now() : null } : {}),
          ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
          ...(patch.revealMode !== undefined ? { revealMode: patch.revealMode } : {}),
          ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
        })
        .where(mine)
        .returning();
      if (row && patch.visibility !== undefined) await setVisibility(tx, row, patch.visibility, now());
      return row;
    });
    if (!list) throw notFound();
    const urls = list.visibility === "public" ? await openUrls([list.id]) : new Map<string, string>();
    return ownerList(list, 0, urls.get(list.id) ?? null);
  });

  /**
   * Puts the list's open items in a new order (drag and drop). The order must name every open item
   * once: when the list changed meanwhile (another device), it answers 409 and nothing moves. No
   * history: the order says nothing about a gift.
   */
  app.put("/lists/:listId/order", async (request, reply) => {
    const { listId } = parse(idParams, request.params);
    const { itemIds } = parse(orderInput, request.body);
    await db.transaction(async (tx) => {
      const [list] = await tx
        .select({ id: schema.wishLists.id })
        .from(schema.wishLists)
        .where(ownedList(listId, userId(request)));
      if (!list) throw notFound();
      const open = await tx
        .select({ id: schema.wishes.id })
        .from(schema.wishes)
        .where(and(eq(schema.wishes.listId, listId), eq(schema.wishes.status, "open")));
      const ids = new Set(open.map((row) => row.id));
      const given = new Set(itemIds);
      if (given.size !== itemIds.length || given.size !== ids.size || !itemIds.every((id) => ids.has(id))) {
        throw new HttpError(409, "order_changed");
      }
      for (const [position, id] of itemIds.entries()) {
        await tx.update(schema.wishes).set({ position }).where(eq(schema.wishes.id, id));
      }
    });
    return reply.code(204).send();
  });

  /**
   * Lifts the secret of the contributions made without an event to the list's items, in `manual`
   * mode: from then on the owner sees who gave what. Final, and possible whenever they decide.
   */
  app.post("/lists/:listId/reveal", async (request) => {
    const { listId } = parse(idParams, request.params);
    const mine = ownedList(listId, userId(request));
    const [list] = await db.select().from(schema.wishLists).where(mine);
    if (!list) throw notFound();
    if (list.revealMode !== "manual") throw new HttpError(409, "reveal_on_received");
    const urls = list.visibility === "public" ? await openUrls([list.id]) : new Map<string, string>();
    if (list.revealedAt) return ownerList(list, 0, urls.get(list.id) ?? null);
    const row = first(await db.update(schema.wishLists).set({ revealedAt: now() }).where(mine).returning());
    return ownerList(row, 0, urls.get(row.id) ?? null);
  });

  /** The items of a list, open ones first in their order, then received and archived ones. */
  app.get("/lists/:listId/items", async (request) => {
    const { listId } = parse(idParams, request.params);
    const [list] = await db
      .select({ id: schema.wishLists.id })
      .from(schema.wishLists)
      .where(ownedList(listId, userId(request)));
    if (!list) throw notFound();
    const rows = await db
      .select()
      .from(schema.wishes)
      .where(and(eq(schema.wishes.listId, listId), isNull(schema.wishes.deletedAt)))
      .orderBy(
        sql`CASE ${schema.wishes.status} WHEN 'open' THEN 0 WHEN 'received' THEN 1 ELSE 2 END`,
        asc(schema.wishes.position),
        asc(schema.wishes.createdAt),
      );
    const pictures = await imagesOf(db, images, rows);
    return rows.map((row) => ownerItem(row, pictures.get(row.id) ?? null));
  });

  /**
   * Deletes a list for good (docs/archive-delete.md), archived or not: it and every one of its
   * items leave every screen and API, its share links stop working, and the gifts still pledged
   * to its items are cancelled (their guests are told). Always allowed, whatever was given: saying
   * no would give a gift away (anti-spoil). Deleting twice answers 404.
   */
  app.delete("/lists/:listId", async (request, reply) => {
    const { listId } = parse(idParams, request.params);
    const ownerId = userId(request);
    const at = now();
    const files = await db.transaction(async (tx) => {
      const [list] = await tx
        .update(schema.wishLists)
        .set({
          deletedAt: at,
          archivedAt: sql`coalesce(${schema.wishLists.archivedAt}, ${at.toISOString()}::timestamptz)`,
        })
        .where(ownedList(listId, ownerId))
        .returning({ id: schema.wishLists.id });
      if (!list) throw notFound();
      await tx
        .update(schema.shareLinks)
        .set({ revokedAt: at })
        .where(and(eq(schema.shareLinks.listId, listId), isNull(schema.shareLinks.revokedAt)));
      const items = await tx
        .select({ id: schema.wishes.id })
        .from(schema.wishes)
        .where(and(eq(schema.wishes.listId, listId), isNull(schema.wishes.deletedAt)));
      return deleteItems(
        tx,
        items.map((item) => item.id),
        ownerId,
        at,
        { listId },
      );
    });
    if (images) await Promise.allSettled(files.map((key) => images.storage.delete(key)));
    return reply.code(204).send();
  });
};
