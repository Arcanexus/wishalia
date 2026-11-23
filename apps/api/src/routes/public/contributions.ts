import { type Database, schema } from "@wishalia/db";
import { cents, isSecretLifted, refuseContribution } from "@wishalia/domain";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { recordHistory } from "../../history.js";
import { first, HttpError, notFound, parse } from "../../http.js";
import { hashToken, isWellFormedToken, newToken } from "../../tokens.js";
import { eventsOfItem, itemInView, revealState, shareOf } from "./view.js";

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

/**
 * Contributions of the guests (spec §2.2): pledges and reservations, made through a share link,
 * with or without an account. Every one writes a sealed history entry in its own transaction. The
 * owner never contributes to their own items, and is never told of a contribution.
 */
export const contributionRoutes: FastifyPluginAsync<{ db: Database; now: () => Date }> = async (
  app,
  { db, now },
) => {
  app.post("/items/:itemId/contributions", async (request, reply) => {
    const { link, viewer, sessionUser } = shareOf(request);
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

      const events = await eventsOfItem(tx, link.ownerId, wish.id);
      const eventId =
        link.scope === "event"
          ? link.eventId
          : (input.eventId ?? (events.length === 1 ? events[0]?.id : undefined));
      if (link.scope === "event" && input.eventId !== undefined && input.eventId !== link.eventId) {
        throw notFound();
      }
      const event = events.find((candidate) => candidate.id === eventId);
      if (!event) {
        throw events.length === 0 ? new HttpError(409, "no_event") : new HttpError(400, "event_required");
      }
      if (isSecretLifted(revealState(event), at)) throw new HttpError(409, "event_closed");

      const active = await tx
        .select({
          eventId: schema.contributions.eventId,
          amountCents: schema.contributions.amountCents,
          units: schema.contributions.units,
        })
        .from(schema.contributions)
        .where(and(eq(schema.contributions.wishId, wish.id), eq(schema.contributions.status, "active")));
      const units =
        locked.kind === "pool" ? undefined : (input.units ?? (locked.kind === "unique" ? 1 : undefined));
      const refusal = refuseContribution(
        {
          kind: locked.kind,
          repeatable: locked.repeatable,
          status: locked.status,
          targetCents: locked.targetCents === null ? null : cents(locked.targetCents),
          quantity: locked.quantity,
        },
        active.map((row) => ({
          eventId: row.eventId,
          status: "active" as const,
          amountCents: row.amountCents === null ? null : cents(row.amountCents),
          units: row.units,
        })),
        { eventId: event.id, amountCents: input.amountCents ?? null, units: units ?? null },
      );
      if (refusal) throw new HttpError(409, refusal);

      const row = first(
        await tx
          .insert(schema.contributions)
          .values({
            wishId: wish.id,
            eventId: event.id,
            contributorId: sessionUser?.id ?? null,
            guestName: sessionUser ? null : (input.guestName ?? null),
            shareLinkId: link.id,
            amountCents: locked.kind === "pool" ? (input.amountCents ?? null) : null,
            units: locked.kind === "pool" ? null : (units ?? null),
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
          type: locked.kind === "pool" ? "contribution_added" : "reserved",
          actorId: sessionUser?.id ?? null,
          payload: {
            contributionId: row.id,
            eventId: event.id,
            amountCents: row.amountCents,
            units: row.units,
            name: row.anonymous ? null : (sessionUser?.displayName ?? row.guestName),
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
      if (!(await itemInView(tx, link, contribution.wishId))) throw notFound();
      if (contribution.status === "withdrawn") return;
      const [event] = await tx.select().from(schema.events).where(eq(schema.events.id, contribution.eventId));
      if (event && isSecretLifted(revealState(event), at)) throw new HttpError(409, "event_closed");

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
};
