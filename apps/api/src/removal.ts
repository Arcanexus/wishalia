import { schema } from "@wishalia/db";
import { deletedItemFields } from "@wishalia/domain";
import { and, eq, inArray } from "drizzle-orm";

import { type HistoryEntry, recordHistory, type Tx } from "./history.js";

/**
 * Deletes items for good, in the caller's transaction (docs/archive-delete.md). Each one is
 * archived and marked deleted, its link, notes and images go, it leaves its events, and the gifts
 * still pledged to it are cancelled, each with its sealed history entry: the guests are told on
 * their link, the owner learns nothing (anti-spoil). The rows stay, since the history is
 * append-only. Gives the keys of the image files to remove once the transaction is done.
 */
export async function deleteItems(
  tx: Tx,
  itemIds: string[],
  actorId: string,
  at: Date,
  payload: Record<string, unknown> = {},
): Promise<string[]> {
  if (itemIds.length === 0) return [];
  // The item's image id goes first: deleting the row it points at must not leave it dangling
  await tx.update(schema.wishes).set(deletedItemFields(at)).where(inArray(schema.wishes.id, itemIds));
  const files = await tx
    .delete(schema.wishImages)
    .where(inArray(schema.wishImages.wishId, itemIds))
    .returning({ key: schema.wishImages.key });
  await tx.delete(schema.eventWishes).where(inArray(schema.eventWishes.wishId, itemIds));
  const cancelled = await tx
    .update(schema.contributions)
    .set({ status: "withdrawn", withdrawnAt: at })
    .where(and(inArray(schema.contributions.wishId, itemIds), eq(schema.contributions.status, "active")))
    .returning({
      id: schema.contributions.id,
      wishId: schema.contributions.wishId,
      eventId: schema.contributions.eventId,
    });
  const entries: HistoryEntry[] = [
    ...itemIds.map((wishId) => ({
      wishId,
      type: "deleted" as const,
      actorId,
      payload,
      visibility: "owner" as const,
    })),
    ...cancelled.map((contribution) => ({
      wishId: contribution.wishId,
      type: "contribution_withdrawn" as const,
      // Taken back by no guest: the deletion did it
      actorId: null,
      payload: { contributionId: contribution.id, eventId: contribution.eventId, reason: "item_deleted" },
      visibility: "sealed" as const,
    })),
  ];
  await recordHistory(tx, entries);
  return files.map((file) => file.key);
}
