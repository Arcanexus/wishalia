import { schema, type Database } from "@wishalia/db";
import type { HistoryVisibility } from "@wishalia/domain";

type ItemEventType = (typeof schema.ITEM_EVENT_TYPES)[number];

/** A transaction, or the database itself. */
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0] | Database;

export interface HistoryEntry {
  wishId: string;
  type: ItemEventType;
  actorId: string | null;
  payload?: Record<string, unknown>;
  visibility: HistoryVisibility;
}

/**
 * Appends entries to the history of the items (spec §7). Called in the transaction of the change
 * itself: a change is never stored without its entry. The table is append-only (trigger).
 */
export async function recordHistory(tx: Tx, entries: HistoryEntry[]): Promise<void> {
  if (entries.length === 0) return;
  await tx.insert(schema.itemEvents).values(entries.map((entry) => ({ payload: {}, ...entry })));
}
