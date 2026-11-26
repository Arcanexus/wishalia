import { schema } from "@wishalia/db";
import { canRevealSecret, DEFAULT_REVEAL_DELAY_DAYS } from "@wishalia/domain";
import { and, asc, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { recordHistory, type Tx } from "../../history.js";
import { first, HttpError, notFound, parse, userId } from "../../http.js";
import { imagesOf } from "../../images.js";
import type { ManageDeps } from "./index.js";
import { ownerEvent, ownerItem } from "./serialize.js";

const eventFields = {
  name: z.string().trim().min(1).max(100),
  kind: z.enum(["birthday", "christmas", "other"]),
  date: z.iso.date(),
  revealDelayDays: z.number().int().min(0).max(365),
};
export const eventInput = z.object({
  ...eventFields,
  kind: eventFields.kind.default("other"),
  revealDelayDays: eventFields.revealDelayDays.default(DEFAULT_REVEAL_DELAY_DAYS),
});
// No default here: a field left out of a patch stays as it is
export const eventPatch = z.object(eventFields).partial().strict();
const eventParams = z.object({ eventId: z.uuid() });
const eventItemParams = z.object({ eventId: z.uuid(), itemId: z.uuid() });

async function ownedEvent(tx: Tx, ownerId: string, eventId: string) {
  const [event] = await tx
    .select()
    .from(schema.events)
    .where(and(eq(schema.events.id, eventId), eq(schema.events.ownerId, ownerId)));
  if (!event) throw notFound();
  return event;
}

export const eventRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db, now, images }) => {
  app.get("/events", async (request) => {
    const rows = await db
      .select()
      .from(schema.events)
      .where(eq(schema.events.ownerId, userId(request)))
      .orderBy(asc(schema.events.date));
    const at = now();
    return rows.map((row) => ownerEvent(row, at));
  });

  app.post("/events", async (request, reply) => {
    const input = parse(eventInput, request.body);
    const event = first(
      await db
        .insert(schema.events)
        .values({ ...input, ownerId: userId(request) })
        .returning(),
    );
    return reply.status(201).send(ownerEvent(event, now()));
  });

  /** The date and the delay can change until the secret is lifted, never after. */
  app.patch("/events/:eventId", async (request) => {
    const { eventId } = parse(eventParams, request.params);
    const patch = parse(eventPatch, request.body);
    const before = await ownedEvent(db, userId(request), eventId);
    if (before.revealedAt && (patch.date !== undefined || patch.revealDelayDays !== undefined)) {
      throw new HttpError(409, "secret_already_lifted");
    }
    const row = first(
      await db.update(schema.events).set(patch).where(eq(schema.events.id, eventId)).returning(),
    );
    return ownerEvent(row, now());
  });

  /** The items an event selects, in their order (the event never owns them). */
  app.get("/events/:eventId/items", async (request) => {
    const { eventId } = parse(eventParams, request.params);
    await ownedEvent(db, userId(request), eventId);
    const rows = await db
      .select({ wish: schema.wishes })
      .from(schema.eventWishes)
      .innerJoin(schema.wishes, eq(schema.wishes.id, schema.eventWishes.wishId))
      .where(eq(schema.eventWishes.eventId, eventId))
      .orderBy(asc(schema.eventWishes.position), asc(schema.eventWishes.addedAt));
    const pictures = await imagesOf(
      db,
      images,
      rows.map((row) => row.wish),
    );
    return rows.map((row) => ownerItem(row.wish, pictures.get(row.wish.id) ?? null));
  });

  app.put("/events/:eventId/items/:itemId", async (request, reply) => {
    const { eventId, itemId } = parse(eventItemParams, request.params);
    const ownerId = userId(request);
    await db.transaction(async (tx) => {
      await ownedEvent(tx, ownerId, eventId);
      const [item] = await tx
        .select({ id: schema.wishes.id })
        .from(schema.wishes)
        .innerJoin(schema.wishLists, eq(schema.wishLists.id, schema.wishes.listId))
        .where(
          and(
            eq(schema.wishes.id, itemId),
            eq(schema.wishLists.ownerId, ownerId),
            isNull(schema.wishes.deletedAt),
          ),
        );
      if (!item) throw notFound();
      const added = await tx
        .insert(schema.eventWishes)
        .values({ eventId, wishId: itemId })
        .onConflictDoNothing()
        .returning();
      if (added.length > 0) {
        await recordHistory(tx, [
          {
            wishId: itemId,
            type: "added_to_event",
            actorId: ownerId,
            payload: { eventId },
            visibility: "owner",
          },
        ]);
      }
    });
    return reply.status(204).send();
  });

  app.delete("/events/:eventId/items/:itemId", async (request, reply) => {
    const { eventId, itemId } = parse(eventItemParams, request.params);
    const ownerId = userId(request);
    await db.transaction(async (tx) => {
      await ownedEvent(tx, ownerId, eventId);
      const removed = await tx
        .delete(schema.eventWishes)
        .where(and(eq(schema.eventWishes.eventId, eventId), eq(schema.eventWishes.wishId, itemId)))
        .returning();
      if (removed.length === 0) throw notFound();
      await recordHistory(tx, [
        {
          wishId: itemId,
          type: "removed_from_event",
          actorId: ownerId,
          payload: { eventId },
          visibility: "owner",
        },
      ]);
    });
    return reply.status(204).send();
  });

  /**
   * Lifts the secret of an event: from then on the owner sees who gave what. Possible from the
   * end of the event day plus the delay (canRevealSecret), and final.
   */
  app.post("/events/:eventId/reveal", async (request) => {
    const { eventId } = parse(eventParams, request.params);
    const event = await ownedEvent(db, userId(request), eventId);
    const at = now();
    if (event.revealedAt) return ownerEvent(event, at);
    if (!canRevealSecret({ eventDate: event.date, revealDelayDays: event.revealDelayDays }, at)) {
      throw new HttpError(409, "too_early", { availableAt: ownerEvent(event, at).revealAvailableAt });
    }
    const row = first(
      await db.update(schema.events).set({ revealedAt: at }).where(eq(schema.events.id, eventId)).returning(),
    );
    return ownerEvent(row, at);
  });
};
