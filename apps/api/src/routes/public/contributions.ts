import { type Database, schema } from "@wishalia/db";
import { cents, goneGift, isLifted, isSecretLifted, refuseContribution } from "@wishalia/domain";
import { and, eq, inArray, or } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { recordHistory } from "../../history.js";
import type { RateLimiter } from "../../rate-limit.js";
import { first, HttpError, notFound, parse } from "../../http.js";
import { hashToken, isWellFormedToken, newToken } from "../../tokens.js";
import { itemSecret, revealState } from "../../secrets.js";
import { eventsOfItem, itemInView, shareOf } from "./view.js";

/** The header that carries the withdraw key of a guest without an account. */
export const WITHDRAW_KEY_HEADER = "x-withdraw-key";

const contributionInput = z
  .object({
    eventId: z.uuid().optional(),
    amountCents: z.number().int().positive().max(100_000_000).optional(),
    units: z.number().int().positive().max(1000).optional(),
    guestName: z.string().trim().min(1).max(60).optional(),
    message: z.string().trim().max(500).optional(),
    anonymous: z.boolean().default(false),
  })
  .strict();
const itemParams = z.object({ itemId: z.uuid() });
const contributionParams = z.object({ contributionId: z.uuid() });
/** The gifts kept on a guest's device (at most 30), each with its withdraw key as the proof. */
const goneInput = z
  .object({
    gifts: z
      .array(z.object({ id: z.uuid(), key: z.string().max(100) }).strict())
      .max(30)
      .default([]),
  })
  .strict();

/**
 * Contributions of the guests (spec §2.2): pledges and reservations, made through a share link,
 * with or without an account. Every one writes a sealed history entry in its own transaction. The
 * owner never contributes to their own items, and is never told of a contribution.
 */
export const contributionRoutes: FastifyPluginAsync<{
  db: Database;
  now: () => Date;
  /** Counts the gifts made through open links, per link and address. */
  openLinkLimiter: RateLimiter;
}> = async (app, { db, now, openLinkLimiter }) => {
  app.post("/items/:itemId/contributions", async (request, reply) => {
    const { link, open, viewer, sessionUser } = shareOf(request);
    if (open) {
      const limit = openLinkLimiter.hit(`${link.id}:${request.ip}`, now());
      if (!limit.allowed) {
        reply.header("retry-after", limit.resetSeconds);
        throw new HttpError(429, "rate_limited");
      }
    }
    const { itemId } = parse(itemParams, request.params);
    const input = parse(contributionInput, request.body);
    if (viewer === "owner") throw new HttpError(403, "owner_cannot_contribute");
    if (!sessionUser && !input.guestName) {
      throw new HttpError(400, "invalid_request", {
        issues: [{ path: "guestName", message: "a name is required without an account" }],
      });
    }
    const at = now();
    const withdrawKey = newToken();

    const contribution = await db.transaction(async (tx) => {
      const wish = await itemInView(tx, link, itemId);
      if (!wish) throw notFound();
      // One contribution at a time per item: the last copy is never reserved twice
      const locked = first(
        await tx.select().from(schema.wishes).where(eq(schema.wishes.id, wish.id)).for("update"),
      );

      // An event link pins its event; a list link takes one of the item's events, or none
      let event: typeof schema.events.$inferSelect | null = null;
      if (link.scope === "event") {
        if (!link.eventId || (input.eventId !== undefined && input.eventId !== link.eventId))
          throw notFound();
        const [pinned] = await tx.select().from(schema.events).where(eq(schema.events.id, link.eventId));
        if (!pinned) throw notFound();
        event = pinned;
      } else if (input.eventId !== undefined) {
        const events = await eventsOfItem(tx, link.ownerId, wish);
        event = events.find((candidate) => candidate.id === input.eventId) ?? null;
        if (!event) throw notFound();
      }
      if (event && isSecretLifted(revealState(event), at)) throw new HttpError(409, "event_closed");
      if (!event) {
        // Without an event, the list keeps the secret: once lifted by hand, it takes nothing more
        const list = first(
          await tx.select().from(schema.wishLists).where(eq(schema.wishLists.id, wish.listId)),
        );
        if (list.revealMode === "manual" && isLifted(itemSecret(wish, list), at)) {
          throw new HttpError(409, "list_closed");
        }
      }

      const active = await tx
        .select({
          eventId: schema.contributions.eventId,
          amountCents: schema.contributions.amountCents,
          units: schema.contributions.units,
        })
        .from(schema.contributions)
        .where(and(eq(schema.contributions.wishId, wish.id), eq(schema.contributions.status, "active")));
      const funding = {
        kind: locked.kind,
        repeatable: locked.repeatable,
        status: locked.status,
        targetCents: locked.targetCents === null ? null : cents(locked.targetCents),
        quantity: locked.quantity,
        priceCents: locked.priceCents === null ? null : cents(locked.priceCents),
      };
      // An amount on a unique gift is a share of its price (refused when it takes none)
      const byAmount =
        locked.kind === "pool" || (locked.kind === "unique" && input.amountCents !== undefined);
      const units = byAmount ? undefined : (input.units ?? (locked.kind === "unique" ? 1 : undefined));
      const refusal = refuseContribution(
        funding,
        active.map((row) => ({
          eventId: row.eventId,
          status: "active" as const,
          amountCents: row.amountCents === null ? null : cents(row.amountCents),
          units: row.units,
        })),
        {
          eventId: event?.id ?? null,
          amountCents: byAmount ? (input.amountCents ?? null) : null,
          units: units ?? null,
        },
      );
      if (refusal) throw new HttpError(409, refusal);

      const row = first(
        await tx
          .insert(schema.contributions)
          .values({
            wishId: wish.id,
            eventId: event?.id ?? null,
            contributorId: sessionUser?.id ?? null,
            guestName: sessionUser ? null : (input.guestName ?? null),
            shareLinkId: link.id,
            amountCents: byAmount ? (input.amountCents ?? null) : null,
            units: byAmount ? null : (units ?? null),
            message: input.message || null,
            anonymous: input.anonymous,
            withdrawKeyHash: hashToken(withdrawKey),
            createdAt: at,
          })
          .returning(),
      );
      await recordHistory(tx, [
        {
          wishId: wish.id,
          type: byAmount ? "contribution_added" : "reserved",
          actorId: sessionUser?.id ?? null,
          payload: {
            contributionId: row.id,
            eventId: row.eventId,
            amountCents: row.amountCents,
            units: row.units,
            name: row.anonymous ? null : (sessionUser?.displayName ?? row.guestName),
            // The word for the owner (« À lire après l'occasion »): read once the secret is lifted
            message: row.message,
          },
          // Shown to the guests, and to the owner once the secret of the event is lifted
          visibility: "sealed",
        },
      ]);
      return row;
    });

    return reply.status(201).send({
      contribution: {
        id: contribution.id,
        itemId: contribution.wishId,
        eventId: contribution.eventId,
        amountCents: contribution.amountCents,
        units: contribution.units,
        message: contribution.message,
        anonymous: contribution.anonymous,
      },
      // Given once: a guest without an account keeps it on their device to withdraw later
      withdrawKey,
    });
  });

  /**
   * Withdraws a contribution: its author only, by their session or by the withdraw key. Anyone
   * else gets the 404 of a missing one. Withdrawing twice changes nothing.
   */
  app.delete("/contributions/:contributionId", async (request, reply) => {
    const { link, sessionUser } = shareOf(request);
    const { contributionId } = parse(contributionParams, request.params);
    const key = request.headers[WITHDRAW_KEY_HEADER];
    const at = now();
    await db.transaction(async (tx) => {
      const [contribution] = await tx
        .select()
        .from(schema.contributions)
        .where(eq(schema.contributions.id, contributionId))
        .for("update");
      if (!contribution) throw notFound();
      const byKey =
        isWellFormedToken(key) &&
        contribution.withdrawKeyHash !== null &&
        contribution.withdrawKeyHash === hashToken(key);
      const bySession = sessionUser !== null && contribution.contributorId === sessionUser.id;
      if (!byKey && !bySession) throw notFound();
      // An archived item too: the guest may take back what they had pledged to it
      const wish = await itemInView(tx, link, contribution.wishId, { archived: true });
      if (!wish) throw notFound();
      if (contribution.status === "withdrawn") return;
      if (contribution.eventId === null) {
        // Without an event, the item and its list keep the secret: once lifted, nothing changes
        if (wish.status === "received") throw new HttpError(409, "item_closed");
        const list = first(
          await tx.select().from(schema.wishLists).where(eq(schema.wishLists.id, wish.listId)),
        );
        if (isLifted(itemSecret(wish, list), at)) throw new HttpError(409, "list_closed");
      } else {
        const [event] = await tx
          .select()
          .from(schema.events)
          .where(eq(schema.events.id, contribution.eventId));
        if (event && isSecretLifted(revealState(event), at)) throw new HttpError(409, "event_closed");
      }

      await tx
        .update(schema.contributions)
        .set({ status: "withdrawn", withdrawnAt: at })
        .where(eq(schema.contributions.id, contribution.id));
      await recordHistory(tx, [
        {
          wishId: contribution.wishId,
          type: "contribution_withdrawn",
          actorId: sessionUser?.id ?? null,
          payload: { contributionId: contribution.id, eventId: contribution.eventId },
          visibility: "sealed",
        },
      ]);
    });
    return reply.status(204).send();
  });

  /**
   * The person's own gifts whose item left the owner's lists (docs/archive-delete.md): archived
   * (the gift is kept and may be taken back) or deleted (the gift was cancelled), so that the page
   * tells them not to buy it. Their gifts only: the ones of their account, and the ones their
   * device proves by the withdraw key. Nothing about anyone else's gifts.
   */
  app.post("/gifts/gone", async (request) => {
    const { link, sessionUser } = shareOf(request);
    const { gifts } = parse(goneInput, request.body);
    const keys = new Map(
      gifts.filter((gift) => isWellFormedToken(gift.key)).map((gift) => [gift.id, hashToken(gift.key)]),
    );
    const mine = or(
      keys.size > 0 ? inArray(schema.contributions.id, [...keys.keys()]) : undefined,
      sessionUser ? eq(schema.contributions.contributorId, sessionUser.id) : undefined,
    );
    if (!mine) return [];
    const rows = await db
      .select({ contribution: schema.contributions, wish: schema.wishes, list: schema.wishLists })
      .from(schema.contributions)
      .innerJoin(schema.wishes, eq(schema.wishes.id, schema.contributions.wishId))
      .innerJoin(schema.wishLists, eq(schema.wishLists.id, schema.wishes.listId))
      .where(and(mine, eq(schema.wishLists.ownerId, link.ownerId)));
    const at = now();
    return rows.flatMap(({ contribution, wish, list }) => {
      const proven =
        (sessionUser !== null && contribution.contributorId === sessionUser.id) ||
        (contribution.withdrawKeyHash !== null && keys.get(contribution.id) === contribution.withdrawKeyHash);
      if (!proven) return [];
      const state = goneGift(
        {
          // An item of an archived list is out of the guests' view too
          status: list.archivedAt && !wish.deletedAt ? "archived" : wish.status,
          deletedAt: wish.deletedAt,
          contribution,
        },
        at,
      );
      if (!state) return [];
      return [
        {
          id: contribution.id,
          itemId: wish.id,
          title: wish.title,
          state,
          eventId: contribution.eventId,
          amountCents: contribution.amountCents === null ? null : cents(contribution.amountCents),
          units: contribution.units,
        },
      ];
    });
  });
};
