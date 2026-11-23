import { schema } from "@wishalia/db";
import {
  canSeeHistoryEntry,
  cleanUrl,
  diffWish,
  type EditableWish,
  MAX_TITLE_LENGTH,
  parseQuickAdd,
} from "@wishalia/domain";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { type HistoryEntry, recordHistory, type Tx } from "../../history.js";
import { first, HttpError, notFound, parse, userId } from "../../http.js";
import type { ManageDeps } from "./index.js";
import { DEFAULT_LIST_NAME } from "./lists.js";
import { ownerItem } from "./serialize.js";

const cents = z.number().int().min(0).max(100_000_000);

/** The quick add (spec §5.1): one field, a URL and/or text. The list is optional. */
const quickAddInput = z.object({
  input: z.string().max(4000),
  listId: z.uuid().optional(),
});

const itemPatch = z
  .object({
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH),
    url: z.string().max(2000).nullable(),
    notes: z.string().max(4000).nullable(),
    priceCents: cents.nullable(),
    targetCents: cents.positive().nullable(),
    quantity: z.number().int().positive().max(1000).nullable(),
    kind: z.enum(["unique", "quantity", "pool"]),
    repeatable: z.boolean(),
    status: z.enum(["open", "received", "archived"]),
    listId: z.uuid(),
    position: z.number().int(),
  })
  .partial()
  .strict();

const itemParams = z.object({ itemId: z.uuid() });

/** An item of the signed-in owner, or 404. */
async function ownedItem(tx: Tx, ownerId: string, itemId: string) {
  const [row] = await tx
    .select({ wish: schema.wishes })
    .from(schema.wishes)
    .innerJoin(schema.wishLists, eq(schema.wishLists.id, schema.wishes.listId))
    .where(and(eq(schema.wishes.id, itemId), eq(schema.wishLists.ownerId, ownerId)));
  if (!row) throw notFound();
  return row.wish;
}

/** A list of the owner (404 otherwise), or their first one, created on the very first add. */
async function targetList(tx: Tx, ownerId: string, listId: string | undefined): Promise<string> {
  if (listId) {
    const [list] = await tx
      .select({ id: schema.wishLists.id })
      .from(schema.wishLists)
      .where(and(eq(schema.wishLists.id, listId), eq(schema.wishLists.ownerId, ownerId)));
    if (!list) throw notFound();
    return list.id;
  }
  const [existing] = await tx
    .select({ id: schema.wishLists.id })
    .from(schema.wishLists)
    .where(and(eq(schema.wishLists.ownerId, ownerId), sql`${schema.wishLists.archivedAt} IS NULL`))
    .orderBy(asc(schema.wishLists.position), asc(schema.wishLists.createdAt))
    .limit(1);
  if (existing) return existing.id;
  const created = first(
    await tx.insert(schema.wishLists).values({ ownerId, name: DEFAULT_LIST_NAME }).returning(),
  );
  return created.id;
}

export const itemRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db, now }) => {
  /**
   * Adds an item at once, with what the input gives (spec §5.2: optimistic add). The worker
   * enriches it later. A link already in one of the owner's open items is flagged, not refused:
   * the app offers to undo rather than asking first.
   */
  app.post("/items", async (request, reply) => {
    const body = parse(quickAddInput, request.body);
    const parsed = parseQuickAdd(body.input);
    if (!parsed)
      throw new HttpError(400, "invalid_request", { issues: [{ path: "input", message: "empty" }] });
    const ownerId = userId(request);

    const { item, duplicates } = await db.transaction(async (tx) => {
      const listId = await targetList(tx, ownerId, body.listId);
      const item = first(
        await tx
          .insert(schema.wishes)
          .values({
            listId,
            title: parsed.title,
            url: parsed.url,
            // New items come first
            position: sql`(SELECT coalesce(min(${schema.wishes.position}) - 1, 0) FROM ${schema.wishes} WHERE ${schema.wishes.listId} = ${listId})`,
          })
          .returning(),
      );
      await recordHistory(tx, [
        {
          wishId: item.id,
          type: "created",
          actorId: ownerId,
          payload: { title: item.title, url: item.url },
          visibility: "owner",
        },
      ]);
      const duplicates = parsed.url
        ? await tx
            .select({ id: schema.wishes.id })
            .from(schema.wishes)
            .innerJoin(schema.wishLists, eq(schema.wishLists.id, schema.wishes.listId))
            .where(
              and(
                eq(schema.wishLists.ownerId, ownerId),
                eq(schema.wishes.url, parsed.url),
                eq(schema.wishes.status, "open"),
                ne(schema.wishes.id, item.id),
              ),
            )
        : [];
      return { item, duplicates };
    });

    return reply.status(201).send({ ...ownerItem(item), duplicateOf: duplicates.map((row) => row.id) });
  });

  app.get("/items/:itemId", async (request) => {
    const { itemId } = parse(itemParams, request.params);
    return ownerItem(await ownedItem(db, userId(request), itemId));
  });

  /**
   * Edits an item in place (spec §6). Every change writes its history entry in the same
   * transaction: "updated" with the diff, "price_changed", "moved", "received", "archived".
   */
  app.patch("/items/:itemId", async (request) => {
    const { itemId } = parse(itemParams, request.params);
    const patch = parse(itemPatch, request.body);
    const ownerId = userId(request);

    const updated = await db.transaction(async (tx) => {
      const before = await ownedItem(tx, ownerId, itemId);
      const { status, listId, position, url, ...fields } = patch;

      // Zod leaves absent fields undefined; the diff and the update only take the fields sent
      const editable = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      ) as Partial<EditableWish>;
      if (url !== undefined) {
        const cleaned = url === null ? null : cleanUrl(url);
        if (url !== null && cleaned === null) {
          throw new HttpError(400, "invalid_request", {
            issues: [{ path: "url", message: "not an http(s) link" }],
          });
        }
        editable.url = cleaned;
      }

      const kind = editable.kind ?? before.kind;
      const quantity = editable.quantity !== undefined ? editable.quantity : before.quantity;
      if (kind === "quantity" && !quantity) {
        throw new HttpError(400, "invalid_request", { issues: [{ path: "quantity", message: "required" }] });
      }

      const entries: HistoryEntry[] = [];
      const { priceCents, ...otherChanges } = diffWish(before, editable);
      if (Object.keys(otherChanges).length > 0) {
        entries.push({
          wishId: itemId,
          type: "updated",
          actorId: ownerId,
          payload: { changes: otherChanges },
          visibility: "owner",
        });
      }
      if (priceCents) {
        entries.push({
          wishId: itemId,
          type: "price_changed",
          actorId: ownerId,
          payload: priceCents,
          visibility: "owner",
        });
      }
      if (listId !== undefined && listId !== before.listId) {
        await targetList(tx, ownerId, listId);
        entries.push({
          wishId: itemId,
          type: "moved",
          actorId: ownerId,
          payload: { from: before.listId, to: listId },
          visibility: "owner",
        });
      }
      if (status !== undefined && status !== before.status) {
        if (status === "received" && before.repeatable) {
          throw new HttpError(409, "repeatable_never_received");
        }
        entries.push({
          wishId: itemId,
          type: status === "open" ? "updated" : status,
          actorId: ownerId,
          payload: status === "open" ? { changes: { status: { from: before.status, to: "open" } } } : {},
          visibility: "owner",
        });
      }

      const [row] = await tx
        .update(schema.wishes)
        .set({
          ...editable,
          ...(status !== undefined ? { status } : {}),
          ...(listId !== undefined ? { listId } : {}),
          ...(position !== undefined ? { position } : {}),
          ...(entries.length > 0 || position !== undefined ? { updatedAt: now() } : {}),
        })
        .where(eq(schema.wishes.id, itemId))
        .returning();
      await recordHistory(tx, entries);
      return first(row ? [row] : []);
    });

    return ownerItem(updated);
  });

  /**
   * The history of an item as the owner sees it: its own entries, and the sealed ones (the
   * contributions) only once the secret of their event is lifted. Through canSeeHistoryEntry,
   * the single rule of @wishalia/domain.
   */
  app.get("/items/:itemId/history", async (request) => {
    const { itemId } = parse(itemParams, request.params);
    await ownedItem(db, userId(request), itemId);

    const entries = await db
      .select()
      .from(schema.itemEvents)
      .where(eq(schema.itemEvents.wishId, itemId))
      .orderBy(asc(schema.itemEvents.at), asc(schema.itemEvents.id));

    const eventIds = [
      ...new Set(
        entries.map((entry) => entry.payload.eventId).filter((id): id is string => typeof id === "string"),
      ),
    ];
    const events = eventIds.length
      ? await db.select().from(schema.events).where(inArray(schema.events.id, eventIds))
      : [];
    const byId = new Map(events.map((event) => [event.id, event]));
    const at = now();

    return entries
      .filter((entry) => {
        const event = typeof entry.payload.eventId === "string" ? byId.get(entry.payload.eventId) : undefined;
        const state = event
          ? { eventDate: event.date, revealDelayDays: event.revealDelayDays, revealedAt: event.revealedAt }
          : // An entry tied to no event can only be shown when it is not sealed
            { eventDate: "9999-12-31", revealDelayDays: 0, revealedAt: null };
        return canSeeHistoryEntry(entry.visibility, "owner", state, at);
      })
      .map((entry) => ({
        id: entry.id,
        type: entry.type,
        at: entry.at.toISOString(),
        actorId: entry.actorId,
        payload: entry.payload,
      }));
  });
};
