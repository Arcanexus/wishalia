/** What the management app reads from /manage (docs/api.md). Never any contribution data. */

export interface Me {
  id: string;
  displayName: string;
  email: string;
}

export interface List {
  id: string;
  name: string;
  position: number;
  theme: "neutral" | "christmas" | null;
  revealMode: "received" | "manual";
  secretLifted: boolean;
  itemCount: number;
  createdAt: string;
  archivedAt: string | null;
}

export type ItemStatus = "open" | "received" | "archived";

export interface Item {
  id: string;
  listId: string;
  kind: "unique" | "quantity" | "pool";
  title: string;
  url: string | null;
  notes: string | null;
  priceCents: number | null;
  status: ItemStatus;
  createdAt: string;
}

/** The quick add's answer: the item, and the open items that already have its link. */
export type AddedItem = Item & { duplicateOf: string[] };

/** What the quick add action answers (lib/server/items.ts). */
export type AddResult =
  | { item: { id: string; title: string; listId: string }; duplicate: boolean }
  | { error: string; input: string };

export type EventKind = "birthday" | "christmas" | "other";

export interface WishEvent {
  id: string;
  name: string;
  kind: EventKind;
  /** A calendar day, YYYY-MM-DD. */
  date: string;
  revealDelayDays: number;
  /** When the owner may lift the secret. */
  revealAvailableAt: string;
  canReveal: boolean;
  secretLifted: boolean;
}

export interface HistoryEntry {
  id: number;
  type: string;
  at: string;
  actorId: string | null;
  payload: Record<string, unknown>;
}

/** Who gave what to an item of an event, once its secret is lifted. */
export interface Gift {
  name: string | null;
  amountCents: number | null;
  units: number | null;
}
