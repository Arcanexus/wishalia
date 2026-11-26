import { schema } from "@wishalia/db";
import {
  canSeeHistoryEntry,
  cleanUrl,
  diffWish,
  type EditableWish,
  inReadingOrder,
  MAX_TITLE_LENGTH,
  MAX_VOLUMES,
  parseQuickAdd,
  refuseVolume,
  type SecretState,
  seriesTitleOf,
} from "@wishalia/domain";
import type { Locale } from "@wishalia/i18n";
import { apiMessages } from "@wishalia/i18n/messages/api";
import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { type HistoryEntry, recordHistory, type Tx } from "../../history.js";
import { first, HttpError, notFound, parse, userId } from "../../http.js";
import type { ManageDeps } from "./index.js";
import { imageOf } from "../../images.js";
import { deleteItems } from "../../removal.js";
import { itemSecret } from "../../secrets.js";
import { itemImageRoutes } from "./item-images.js";
import { ownerItem } from "./serialize.js";

const cents = z.number().int().min(0).max(100_000_000);

/**
 * The quick add (spec §5.1): one field, a URL and/or text. The list is optional; with a series
 * (parentId), the wish is added as its last volume, in the series' list (docs/series.md).
 */
export const quickAddInput = z.object({
  input: z.string().max(4000),
  listId: z.uuid().optional(),
  parentId: z.uuid().optional(),
});

/** Wishes of a list grouped into a new series; its name is guessed from theirs when not given. */
export const seriesInput = z
  .object({
    itemIds: z.array(z.uuid()).min(1).max(MAX_VOLUMES),
    title: z.string().trim().min(1).max(MAX_TITLE_LENGTH).optional(),
  })
  .strict();

/** Wishes put into an existing series, as its last volumes. */
export const volumesInput = z.object({ itemIds: z.array(z.uuid()).min(1).max(MAX_VOLUMES) }).strict();

/** The series' open volumes, every one of them, in their new order. */
export const volumeOrderInput = z.object({ itemIds: z.array(z.uuid()).min(1).max(MAX_VOLUMES) }).strict();

/** What a series has of its own: a name, notes, where it stands. The rest belongs to its volumes. */
const SERIES_FIELDS = new Set(["title", "notes", "status", "listId", "position"]);

export const itemPatch = z
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
    /** Into a series (its id) or out of it (null): docs/series.md. */
    parentId: z.uuid().nullable(),
  })
  .partial()
  .strict();

const itemParams = z.object({ itemId: z.uuid() });
const listParams = z.object({ listId: z.uuid() });

type WishRow = typeof schema.wishes.$inferSelect;

/** A series of the owner, or 404: never a wish of another kind. */
async function ownedSeries(tx: Tx, ownerId: string, itemId: string): Promise<WishRow> {
  const series = await ownedItem(tx, ownerId, itemId);
  if (series.kind !== "series") throw notFound();
  return series;
}

/** The volumes of a series that are not deleted, in their order. */
export async function volumesOf(tx: Tx, seriesIds: string[]): Promise<WishRow[]> {
  if (seriesIds.length === 0) return [];
  return tx
    .select()
    .from(schema.wishes)
    .where(and(inArray(schema.wishes.parentId, seriesIds), isNull(schema.wishes.deletedAt)))
    .orderBy(asc(schema.wishes.position), asc(schema.wishes.createdAt));
}

/** The position after a series' last volume. */
const afterLastVolume = (seriesId: string) =>
  sql`(SELECT coalesce(max(${schema.wishes.position}) + 1, 0) FROM ${schema.wishes} WHERE ${schema.wishes.parentId} = ${seriesId})`;

/** The position before a list's first wish of its own: where a wish taken out of a series goes. */
const beforeFirst = (listId: string) =>
  sql`(SELECT coalesce(min(${schema.wishes.position}) - 1, 0) FROM ${schema.wishes} WHERE ${schema.wishes.listId} = ${listId} AND ${schema.wishes.parentId} IS NULL)`;

/**
 * Puts wishes into a series, after its last volumes, in their reading order (« T2 » before
 * « T10 »). Each one writes its « grouped » entry; one that was in another series leaves it.
 * Refused (409) for a series, a wish of another list or a deleted one (404).
 */
async function groupInto(tx: Tx, ownerId: string, series: WishRow, itemIds: string[]) {
  const ids = [...new Set(itemIds)].filter((id) => id !== series.id);
  const rows = ids.length
    ? await tx
        .select({ wish: schema.wishes })
        .from(schema.wishes)
        .innerJoin(schema.wishLists, eq(schema.wishLists.id, schema.wishes.listId))
        .where(
          and(
            inArray(schema.wishes.id, ids),
            eq(schema.wishLists.ownerId, ownerId),
            isNull(schema.wishes.deletedAt),
          ),
        )
    : [];
  if (rows.length !== ids.length) throw notFound();
  for (const { wish } of rows) {
    const refusal = refuseVolume(wish, series);
    if (refusal) throw new HttpError(409, refusal);
  }
  const ordered = inReadingOrder(rows.map((row) => row.wish)).filter((wish) => wish.parentId !== series.id);
  const [last] = await tx
    .select({ position: sql<number>`coalesce(max(${schema.wishes.position}) + 1, 0)` })
    .from(schema.wishes)
    .where(and(eq(schema.wishes.parentId, series.id), notInArray(schema.wishes.id, ids)));
  const start = Number(last?.position ?? 0);
  for (const [index, wish] of ordered.entries()) {
    await tx
      .update(schema.wishes)
      .set({ parentId: series.id, position: start + index })
      .where(eq(schema.wishes.id, wish.id));
  }
  await recordHistory(
    tx,
    ordered.map((wish) => ({
      wishId: wish.id,
      type: "grouped" as const,
      actorId: ownerId,
      payload: { seriesId: series.id, title: series.title, from: wish.parentId },
      visibility: "owner" as const,
    })),
  );
  return ordered.length;
}

/** An item of the signed-in owner, or 404: a deleted one too. */
export async function ownedItem(tx: Tx, ownerId: string, itemId: string) {
  const [row] = await tx
    .select({ wish: schema.wishes })
    .from(schema.wishes)
    .innerJoin(schema.wishLists, eq(schema.wishLists.id, schema.wishes.listId))
    .where(
      and(
        eq(schema.wishes.id, itemId),
        eq(schema.wishLists.ownerId, ownerId),
        isNull(schema.wishes.deletedAt),
      ),
    );
  if (!row) throw notFound();
  return row.wish;
}

/** A list of the owner (404 otherwise), or their first one, created on the very first add. */
async function targetList(
  tx: Tx,
  ownerId: string,
  listId: string | undefined,
  locale: Locale,
): Promise<string> {
  if (listId) {
    const [list] = await tx
      .select({ id: schema.wishLists.id })
      .from(schema.wishLists)
      .where(
        and(
          eq(schema.wishLists.id, listId),
          eq(schema.wishLists.ownerId, ownerId),
          isNull(schema.wishLists.deletedAt),
        ),
      );
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
    await tx
      .insert(schema.wishLists)
      .values({ ownerId, name: apiMessages(locale).defaultListName })
      .returning(),
  );
  return created.id;
}

export const itemRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db, now, images }) => {
  await app.register(itemImageRoutes, { db, now, images });

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
      const series = body.parentId ? await ownedSeries(tx, ownerId, body.parentId) : null;
      const listId = series ? series.listId : await targetList(tx, ownerId, body.listId, request.locale);
      const item = first(
        await tx
          .insert(schema.wishes)
          .values({
            listId,
            title: parsed.title,
            url: parsed.url,
            // The worker completes it from its link (docs/enrichment.md)
            enrichment: parsed.url ? "pending" : null,
            // New items come first; a new volume comes last in its series
            ...(series
              ? { parentId: series.id, position: afterLastVolume(series.id) }
              : { position: beforeFirst(listId) }),
          })
          .returning(),
      );
      await recordHistory(tx, [
        {
          wishId: item.id,
          type: "created",
          actorId: ownerId,
          payload: { title: item.title, url: item.url, ...(series ? { seriesId: series.id } : {}) },
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
    const item = await ownedItem(db, userId(request), itemId);
    return ownerItem(item, await imageOf(db, images, item));
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
      const { status, listId, position, url, parentId, ...fields } = patch;
      // A series has a name and notes; prices, links and kinds belong to its volumes
      if (before.kind === "series") {
        const wrong = Object.keys(patch).filter(
          (key) => !SERIES_FIELDS.has(key) && patch[key as keyof typeof patch] !== undefined,
        );
        if (wrong.length > 0) {
          throw new HttpError(400, "invalid_request", {
            issues: wrong.map((path) => ({ path, message: "not for a series" })),
          });
        }
        if (status === "received") throw new HttpError(409, "series_received_by_volume");
      }

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
      // A new link: the worker completes the item from it again
      const relink =
        editable.url !== undefined && editable.url !== before.url
          ? { enrichment: editable.url ? ("pending" as const) : null, enrichmentAttempts: 0 }
          : {};

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
      // Into a series: in its list, after its last volume. Out of it: first in the list
      let parent: { parentId?: string | null; position?: ReturnType<typeof sql> } = {};
      let targetListId = listId;
      if (parentId !== undefined && parentId !== before.parentId) {
        if (parentId === null) {
          parent = { parentId: null, position: beforeFirst(listId ?? before.listId) };
          entries.push({
            wishId: itemId,
            type: "ungrouped",
            actorId: ownerId,
            payload: { seriesId: before.parentId },
            visibility: "owner",
          });
        } else {
          const joined = await ownedSeries(tx, ownerId, parentId);
          const refusal = refuseVolume({ ...before, listId: joined.listId }, joined);
          if (refusal) throw new HttpError(409, refusal);
          targetListId = joined.listId;
          parent = { parentId: joined.id, position: afterLastVolume(joined.id) };
          entries.push({
            wishId: itemId,
            type: "grouped",
            actorId: ownerId,
            payload: { seriesId: joined.id, title: joined.title, from: before.parentId },
            visibility: "owner",
          });
        }
      } else if (listId !== undefined && listId !== before.listId && before.parentId) {
        // Gone to another list: out of its series, first in the new list
        parent = { parentId: null, position: beforeFirst(listId) };
        entries.push({
          wishId: itemId,
          type: "ungrouped",
          actorId: ownerId,
          payload: { seriesId: before.parentId },
          visibility: "owner",
        });
      }
      const movedVolumes: string[] = [];
      if (targetListId !== undefined && targetListId !== before.listId) {
        await targetList(tx, ownerId, targetListId, request.locale);
        entries.push({
          wishId: itemId,
          type: "moved",
          actorId: ownerId,
          payload: { from: before.listId, to: targetListId },
          visibility: "owner",
        });
        // A series takes its volumes along
        if (before.kind === "series") {
          for (const volume of await volumesOf(tx, [itemId])) {
            movedVolumes.push(volume.id);
            entries.push({
              wishId: volume.id,
              type: "moved",
              actorId: ownerId,
              payload: { from: before.listId, to: targetListId },
              visibility: "owner",
            });
          }
        }
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
          ...relink,
          ...(status !== undefined ? { status } : {}),
          ...(targetListId !== undefined ? { listId: targetListId } : {}),
          ...(position !== undefined ? { position } : {}),
          ...parent,
          ...(entries.length > 0 || position !== undefined ? { updatedAt: now() } : {}),
        })
        .where(eq(schema.wishes.id, itemId))
        .returning();
      if (movedVolumes.length > 0 && targetListId) {
        await tx
          .update(schema.wishes)
          .set({ listId: targetListId, updatedAt: now() })
          .where(inArray(schema.wishes.id, movedVolumes));
      }
      await recordHistory(tx, entries);
      return first(row ? [row] : []);
    });

    return ownerItem(updated, await imageOf(db, images, updated));
  });

  /**
   * The history of an item as the owner sees it: its own entries, and the sealed ones (the
   * contributions) only once the secret of their event is lifted. Through canSeeHistoryEntry,
   * the single rule of @wishalia/domain.
   */
  app.get("/items/:itemId/history", async (request) => {
    const { itemId } = parse(itemParams, request.params);
    const item = await ownedItem(db, userId(request), itemId);
    const list = first(await db.select().from(schema.wishLists).where(eq(schema.wishLists.id, item.listId)));

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

    // The REST API v1 never gives contribution data (CLAUDE.md, rule 2), not even once a secret
    // is lifted: who gave what stays in the management app
    const sealedAllowed = request.scope !== "v1";
    return entries
      .filter((entry) => {
        if (entry.visibility === "sealed" && !sealedAllowed) return false;
        const eventId = entry.payload.eventId;
        const event = typeof eventId === "string" ? byId.get(eventId) : undefined;
        const state: SecretState = event
          ? { eventDate: event.date, revealDelayDays: event.revealDelayDays, revealedAt: event.revealedAt }
          : typeof eventId === "string"
            ? // An event that cannot be found keeps its secret
              { eventDate: "9999-12-31", revealDelayDays: 0, revealedAt: null }
            : // A contribution without an event: its item and list keep the secret
              itemSecret(item, list);
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

  /**
   * Deletes an item for good (docs/archive-delete.md), open, received or archived: it leaves its
   * list, its events and every link, its images go, and the gifts still pledged to it are
   * cancelled (their guests are told on their link). Always allowed, whatever was given: saying no
   * would give a gift away (anti-spoil). Deleting twice answers 404.
   */
  app.delete("/items/:itemId", async (request, reply) => {
    const { itemId } = parse(itemParams, request.params);
    const ownerId = userId(request);
    const files = await db.transaction(async (tx) => {
      const item = await ownedItem(tx, ownerId, itemId);
      // A series goes with every one of its volumes
      const volumes = item.kind === "series" ? await volumesOf(tx, [itemId]) : [];
      return deleteItems(tx, [itemId, ...volumes.map((volume) => volume.id)], ownerId, now());
    });
    if (images) await Promise.allSettled(files.map((key) => images.storage.delete(key)));
    return reply.code(204).send();
  });

  /**
   * Groups wishes of a list into a new series (docs/series.md), where the first of them stood. Its
   * name is the one given, or the words their titles share (« Dragon Ball Perfect Edition »).
   */
  app.post("/lists/:listId/series", async (request, reply) => {
    const { listId } = parse(listParams, request.params);
    const body = parse(seriesInput, request.body);
    const ownerId = userId(request);
    const series = await db.transaction(async (tx) => {
      await targetList(tx, ownerId, listId, request.locale);
      const rows = await tx
        .select()
        .from(schema.wishes)
        .where(
          and(
            inArray(schema.wishes.id, body.itemIds),
            eq(schema.wishes.listId, listId),
            isNull(schema.wishes.deletedAt),
          ),
        );
      if (rows.length !== new Set(body.itemIds).size) throw notFound();
      if (rows.some((row) => row.kind === "series")) throw new HttpError(409, "is_series");
      const title =
        body.title ?? seriesTitleOf(inReadingOrder(rows).map((row) => row.title)) ?? rows[0]?.title ?? "";
      // Where the first of them stood in the list (a volume counts where its series stands)
      const own = rows.filter((row) => row.parentId === null && row.status === "open");
      const position = own.length ? Math.min(...own.map((row) => row.position)) : beforeFirst(listId);
      const created = first(
        await tx.insert(schema.wishes).values({ listId, kind: "series", title, position }).returning(),
      );
      await recordHistory(tx, [
        {
          wishId: created.id,
          type: "created",
          actorId: ownerId,
          payload: { title: created.title, kind: "series" },
          visibility: "owner",
        },
      ]);
      await groupInto(tx, ownerId, created, body.itemIds);
      return created;
    });
    return reply.status(201).send(ownerItem(series));
  });

  /** Puts wishes of the series' list into it, as its last volumes. */
  app.post("/items/:itemId/volumes", async (request) => {
    const { itemId } = parse(itemParams, request.params);
    const { itemIds } = parse(volumesInput, request.body);
    const ownerId = userId(request);
    const added = await db.transaction(async (tx) => {
      const series = await ownedSeries(tx, ownerId, itemId);
      return groupInto(tx, ownerId, series, itemIds);
    });
    return { added };
  });

  /**
   * Puts a series' open volumes in a new order. Like the list's order: every open volume once, or
   * 409 when the series changed meanwhile.
   */
  app.put("/items/:itemId/order", async (request, reply) => {
    const { itemId } = parse(itemParams, request.params);
    const { itemIds } = parse(volumeOrderInput, request.body);
    await db.transaction(async (tx) => {
      await ownedSeries(tx, userId(request), itemId);
      const open = (await volumesOf(tx, [itemId])).filter((volume) => volume.status === "open");
      const ids = new Set(open.map((volume) => volume.id));
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
   * Undoes a series: its volumes become wishes of their own again, where the series stood, in its
   * order; the series itself goes (it holds no gift, only its volumes do).
   */
  app.post("/items/:itemId/ungroup", async (request, reply) => {
    const { itemId } = parse(itemParams, request.params);
    const ownerId = userId(request);
    await db.transaction(async (tx) => {
      const series = await ownedSeries(tx, ownerId, itemId);
      const volumes = await volumesOf(tx, [itemId]);
      // The list's own wishes, in their order, the volumes where the series was
      const own = await tx
        .select({ id: schema.wishes.id })
        .from(schema.wishes)
        .where(
          and(
            eq(schema.wishes.listId, series.listId),
            isNull(schema.wishes.parentId),
            isNull(schema.wishes.deletedAt),
          ),
        )
        .orderBy(asc(schema.wishes.position), asc(schema.wishes.createdAt));
      const order = own.flatMap((row) => (row.id === itemId ? volumes.map((volume) => volume.id) : [row.id]));
      for (const [position, id] of order.entries()) {
        await tx
          .update(schema.wishes)
          .set({ position, ...(volumes.some((volume) => volume.id === id) ? { parentId: null } : {}) })
          .where(eq(schema.wishes.id, id));
      }
      await recordHistory(
        tx,
        volumes.map((volume) => ({
          wishId: volume.id,
          type: "ungrouped" as const,
          actorId: ownerId,
          payload: { seriesId: itemId },
          visibility: "owner" as const,
        })),
      );
      await deleteItems(tx, [itemId], ownerId, now(), { ungrouped: true });
    });
    return reply.code(204).send();
  });
};
