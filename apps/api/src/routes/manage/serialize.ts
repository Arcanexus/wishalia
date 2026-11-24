import type { schema } from "@wishalia/db";
import { canRevealSecret, isSecretLifted, revealAvailableAt } from "@wishalia/domain";

type WishRow = typeof schema.wishes.$inferSelect;
type ListRow = typeof schema.wishLists.$inferSelect;
type EventRow = typeof schema.events.$inferSelect;

/**
 * An item as the owner sees it. Built field by field, never by spreading a row: no contribution
 * data can slip into a /manage response (spec §3), even when a column is added later.
 */
export function ownerItem(row: WishRow) {
  return {
    id: row.id,
    listId: row.listId,
    kind: row.kind,
    repeatable: row.repeatable,
    title: row.title,
    url: row.url,
    notes: row.notes,
    imageKey: row.imageKey,
    priceCents: row.priceCents,
    targetCents: row.targetCents,
    quantity: row.quantity,
    seriesId: row.seriesId,
    seriesNumber: row.seriesNumber,
    seriesState: row.seriesState,
    status: row.status,
    position: row.position,
    /** The completion from the link: "pending" while the worker has it to do (or is on it). */
    enrichment: row.enrichment === "running" ? "pending" : row.enrichment,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function ownerList(row: ListRow, itemCount: number) {
  return {
    id: row.id,
    name: row.name,
    position: row.position,
    theme: row.theme,
    revealMode: row.revealMode,
    secretLifted: row.revealMode === "manual" && row.revealedAt !== null,
    itemCount,
    createdAt: row.createdAt.toISOString(),
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

/** An event, with where its secret stands: what the owner needs to know, and nothing more. */
export function ownerEvent(row: EventRow, now: Date) {
  const state = { eventDate: row.date, revealDelayDays: row.revealDelayDays, revealedAt: row.revealedAt };
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    date: row.date,
    revealDelayDays: row.revealDelayDays,
    revealAvailableAt: revealAvailableAt(state).toISOString(),
    canReveal: canRevealSecret(state, now),
    secretLifted: isSecretLifted(state, now),
  };
}
