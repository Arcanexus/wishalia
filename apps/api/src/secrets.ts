import type { schema } from "@wishalia/db";
import type { ItemSecretState, RevealState } from "@wishalia/domain";

type EventRow = typeof schema.events.$inferSelect;
type WishRow = typeof schema.wishes.$inferSelect;
type ListRow = Pick<typeof schema.wishLists.$inferSelect, "revealMode" | "revealedAt">;

/** The secret of the contributions of an event. */
export const revealState = (event: EventRow): RevealState => ({
  eventDate: event.date,
  revealDelayDays: event.revealDelayDays,
  revealedAt: event.revealedAt,
});

/** The secret of the contributions made to an item without an event: its list's mode decides. */
export const itemSecret = (wish: Pick<WishRow, "status">, list: ListRow): ItemSecretState => ({
  mode: list.revealMode,
  itemReceived: wish.status === "received",
  listRevealedAt: list.revealedAt,
});
