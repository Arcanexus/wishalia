import { createHash } from "node:crypto";

import { type Database, schema } from "@wishalia/db";
import { isLive, stageOf } from "@wishalia/domain";
import { and, eq, ne } from "drizzle-orm";

/**
 * The small answer the live pages ask for (docs/live-updates.md): a fingerprint of the items as
 * shown, and how many are still being completed. The pages load the list again only when the
 * fingerprint changes. It is built from the items' own columns only: a contribution never
 * changes it, so that the owner cannot learn from it that someone gave (anti-spoil, spec §3).
 */
export interface LiveState {
  version: string;
  /** Items the worker is still on (reading the link, or fetching its images). */
  live: number;
}

const columns = {
  id: schema.wishes.id,
  updatedAt: schema.wishes.updatedAt,
  position: schema.wishes.position,
  status: schema.wishes.status,
  imageId: schema.wishes.imageId,
  enrichment: schema.wishes.enrichment,
  enrichmentStep: schema.wishes.enrichmentStep,
};
type Row = { [K in keyof typeof columns]: (typeof schema.wishes.$inferSelect)[K] };

export function liveState(rows: readonly Row[]): LiveState {
  const hash = createHash("sha256");
  let live = 0;
  for (const row of [...rows].sort((a, b) => (a.id < b.id ? -1 : 1))) {
    const stage = stageOf(row.enrichment, row.enrichmentStep);
    if (isLive(stage)) live += 1;
    hash.update(
      [row.id, row.updatedAt.getTime(), row.position, row.status, row.imageId ?? "", stage ?? ""].join("|"),
    );
    hash.update("\n");
  }
  return { version: hash.digest("base64url").slice(0, 22), live };
}

/** The items of a list, archived ones aside, as the live answer needs them. */
export async function listLive(db: Database, listId: string): Promise<LiveState> {
  const rows = await db
    .select(columns)
    .from(schema.wishes)
    .where(and(eq(schema.wishes.listId, listId), ne(schema.wishes.status, "archived")));
  return liveState(rows);
}

/** The items of an event, archived ones aside. */
export async function eventLive(db: Database, eventId: string): Promise<LiveState> {
  const rows = await db
    .select(columns)
    .from(schema.eventWishes)
    .innerJoin(schema.wishes, eq(schema.wishes.id, schema.eventWishes.wishId))
    .where(and(eq(schema.eventWishes.eventId, eventId), ne(schema.wishes.status, "archived")));
  return liveState(rows);
}
