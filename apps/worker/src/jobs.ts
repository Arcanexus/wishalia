import { schema, type Database } from "@wishalia/db";
import { completion, MAX_ENRICHMENT_ATTEMPTS } from "@wishalia/domain";
import { eq, sql } from "drizzle-orm";

import { extract } from "./extract.js";
import { FetchError, type Page } from "./fetch.js";

/**
 * The enrichment queue (docs/enrichment.md): the items whose `enrichment` is "pending", oldest
 * first. A worker takes one with SKIP LOCKED, so several replicas never take the same item; a run
 * that died (its worker stopped) is taken again after RUN_TIMEOUT_MS; a failure waits a bit longer
 * at each attempt, and the item is "failed" after MAX_ENRICHMENT_ATTEMPTS.
 */

export const RUN_TIMEOUT_MS = 2 * 60_000;
/** The wait before trying again, per attempt already made. */
export const RETRY_DELAY_MS = 60_000;

export type Outcome = "idle" | "done" | "unchanged" | "retry" | "failed" | "skipped";

export interface JobDeps {
  db: Database;
  fetchPage: (url: string) => Promise<Page>;
  now?: () => Date;
}

interface Claimed {
  id: string;
  url: string | null;
  attempts: number;
}

/** Takes the next item to complete, if any, and marks it running. */
export async function claim(db: Database, now: Date): Promise<Claimed | null> {
  const stale = new Date(now.getTime() - RUN_TIMEOUT_MS);
  const result = await db.execute<{ id: string; url: string | null; enrichment_attempts: number }>(sql`
    UPDATE ${schema.wishes}
    SET enrichment = 'running', enrichment_at = ${now}, enrichment_attempts = enrichment_attempts + 1
    WHERE id = (
      SELECT id FROM ${schema.wishes}
      WHERE (
          (enrichment = 'pending' AND (enrichment_at IS NULL
            OR enrichment_at < ${now}::timestamptz - make_interval(secs => ${RETRY_DELAY_MS / 1000} * enrichment_attempts)))
          OR (enrichment = 'running' AND enrichment_at < ${stale})
        )
        AND enrichment_attempts < ${MAX_ENRICHMENT_ATTEMPTS}
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id, url, enrichment_attempts
  `);
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as {
    id: string;
    url: string | null;
    enrichment_attempts: number;
  }[];
  const [row] = rows;
  return row ? { id: row.id, url: row.url, attempts: row.enrichment_attempts } : null;
}

/** Completes the next item from its link. Returns what happened, for the metrics. */
export async function enrichNext({ db, fetchPage, now = () => new Date() }: JobDeps): Promise<Outcome> {
  const job = await claim(db, now());
  if (!job) return "idle";
  if (!job.url) {
    await db.update(schema.wishes).set({ enrichment: null }).where(eq(schema.wishes.id, job.id));
    return "skipped";
  }
  let found;
  try {
    found = extract((await fetchPage(job.url)).html);
  } catch (error) {
    // A page that cannot be read now may be read later; a refused address never will
    const final =
      job.attempts >= MAX_ENRICHMENT_ATTEMPTS ||
      (error instanceof FetchError &&
        ["blocked_address", "blocked_port", "invalid_url"].includes(error.code));
    await db
      .update(schema.wishes)
      .set({ enrichment: final ? "failed" : "pending", enrichmentAt: now() })
      .where(eq(schema.wishes.id, job.id));
    return final ? "failed" : "retry";
  }

  return db.transaction(async (tx) => {
    // The item as it is now: the owner may have changed it while the page loaded
    const [current] = await tx.select().from(schema.wishes).where(eq(schema.wishes.id, job.id)).for("update");
    // Gone, or a new link meanwhile (the edit queued it again): this result is for nothing
    if (!current || current.url !== job.url || current.enrichment !== "running") return "skipped";
    const patch = completion(current, found);
    const changed = Object.keys(patch).length > 0;
    await tx
      .update(schema.wishes)
      .set({ ...patch, enrichment: "done", ...(changed ? { updatedAt: now() } : {}) })
      .where(eq(schema.wishes.id, job.id));
    if (changed) {
      await tx.insert(schema.itemEvents).values({
        wishId: job.id,
        type: "enriched",
        actorId: null,
        payload: { ...patch },
        visibility: "owner",
      });
    }
    return changed ? "done" : "unchanged";
  });
}
