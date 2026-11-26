/**
 * Archiving and deleting (docs/archive-delete.md). Archived: hidden from the guests, kept, and
 * restorable by the owner. Deleted: for good, out of every screen and API.
 *
 * Anti-spoil: the owner is never told whether someone meant to give a gift they archive or delete,
 * since that alone would give the gift away. Both are always allowed, with the same words. The
 * guests who meant to give it are the ones who are told, on their own link.
 */

/** How long a guest is told that a gift they meant to give was deleted. */
export const DELETED_NOTICE_DAYS = 30;
const DAY_MS = 86_400_000;

export type GoneState = "archived" | "deleted";

export interface GoneSignals {
  /** The item's status: an archived item is out of the guests' view. */
  status: "open" | "received" | "archived";
  /** When the item was deleted, null while it is not. */
  deletedAt: Date | null;
  /** The guest's contribution. */
  contribution: { status: "active" | "withdrawn"; withdrawnAt: Date | null };
}

/**
 * What a guest is told about one of their gifts whose item left the list, or null when there is
 * nothing to say: its item is still there, or the guest took the gift back themselves.
 *
 * - archived: the item is out of the list for now; the gift is kept, in case the owner restores it,
 *   and the guest may take it back.
 * - deleted: the item is gone for good and the gift was cancelled with it; said for
 *   DELETED_NOTICE_DAYS days.
 */
export function goneGift(signals: GoneSignals, now: Date): GoneState | null {
  const { status, deletedAt, contribution } = signals;
  if (deletedAt) {
    // Only a gift the deletion cancelled: one taken back before stays the guest's own doing
    const cancelledByDeletion =
      contribution.status === "active" ||
      (contribution.withdrawnAt !== null && contribution.withdrawnAt.getTime() === deletedAt.getTime());
    if (!cancelledByDeletion) return null;
    return now.getTime() - deletedAt.getTime() <= DELETED_NOTICE_DAYS * DAY_MS ? "deleted" : null;
  }
  if (status === "archived" && contribution.status === "active") return "archived";
  return null;
}

/**
 * What a deletion removes from an item, beside marking it: its link, its notes, its image and
 * its place in the queue of the worker. Its title stays, for the guests' notice.
 */
export function deletedItemFields(at: Date) {
  return {
    status: "archived" as const,
    deletedAt: at,
    url: null,
    notes: null,
    foundTitle: null,
    foundPriceCents: null,
    imageId: null,
    imageCrop: null,
    enrichment: null,
    updatedAt: at,
  };
}
