import { randomUUID } from "node:crypto";

import { schema, type Database } from "@wishalia/db";
import {
  completion,
  isProposable,
  MAX_ENRICHMENT_ATTEMPTS,
  MAX_PAGE_IMAGES,
  pageImageLinks,
} from "@wishalia/domain";
import { sniffImage, type Storage } from "@wishalia/storage";
import { and, eq, inArray, sql } from "drizzle-orm";

import { extract, extractImages } from "./extract.js";
import { type Download, FetchError, type Page } from "./fetch.js";

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
  /** The bucket and the image download: without them, the worker completes the text only. */
  storage?: Storage | null;
  fetchImage?: (url: string) => Promise<Download>;
  now?: () => Date;
}

/** An image of the page, checked and in the bucket, not yet in the database. */
interface Stored {
  key: string;
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

/** How many links of a page are tried, for MAX_PAGE_IMAGES good images. */
const LINKS_TRIED = 8;

/**
 * The images of the page (docs/images.md): each link fetched through the SSRF guard, read again
 * from its bytes (a real JPEG, PNG, WebP, GIF, AVIF or HEIC; never SVG), large enough, then put in
 * the bucket. A link that fails is skipped: the others still count.
 */
async function storePageImages(
  wishId: string,
  page: Page,
  storage: Storage,
  fetchImage: (url: string) => Promise<Download>,
): Promise<Stored[]> {
  const stored: Stored[] = [];
  for (const link of pageImageLinks(extractImages(page.html), page.url, LINKS_TRIED)) {
    if (stored.length >= MAX_PAGE_IMAGES) break;
    try {
      const file = await fetchImage(link);
      const sniffed = sniffImage(file.bytes);
      if (!sniffed) continue;
      const image = { ...sniffed, bytes: file.bytes.length };
      if (!isProposable(image)) continue;
      const key = `wishes/${wishId}/${randomUUID()}`;
      await storage.put(key, file.bytes, sniffed.type);
      stored.push({
        key,
        contentType: sniffed.type,
        bytes: image.bytes,
        width: image.width,
        height: image.height,
      });
    } catch {
      // An image that cannot be fetched or kept: the next one
    }
  }
  return stored;
}

/** Removes files from the bucket, best effort: a file left behind costs room, never data. */
async function removeFiles(storage: Storage | null | undefined, keys: string[]) {
  if (!storage) return;
  await Promise.allSettled(keys.map((key) => storage.delete(key)));
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
export async function enrichNext({
  db,
  fetchPage,
  storage,
  fetchImage,
  now = () => new Date(),
}: JobDeps): Promise<Outcome> {
  const job = await claim(db, now());
  if (!job) return "idle";
  if (!job.url) {
    await db.update(schema.wishes).set({ enrichment: null }).where(eq(schema.wishes.id, job.id));
    return "skipped";
  }
  let found;
  let page: Page;
  try {
    page = await fetchPage(job.url);
    found = extract(page.html);
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

  const images = storage && fetchImage ? await storePageImages(job.id, page, storage, fetchImage) : [];
  const stale: string[] = [];

  let outcome: Outcome;
  try {
    outcome = await db.transaction(async (tx) => {
      // The item as it is now: the owner may have changed it while the page loaded
      const [current] = await tx
        .select()
        .from(schema.wishes)
        .where(eq(schema.wishes.id, job.id))
        .for("update");
      // Gone, or a new link meanwhile (the edit queued it again): this result is for nothing
      if (!current || current.url !== job.url || current.enrichment !== "running") {
        stale.push(...images.map((image) => image.key));
        return "skipped";
      }
      const patch = completion(current, found);
      const changed = Object.keys(patch).length > 0;

      // The new proposals replace those of the page found before (an older link, an older run);
      // the owner's own images stay. The item shows the first one, unless the owner chose theirs.
      let imageId = current.imageId;
      if (images.length > 0) {
        const previous = await tx
          .select({ id: schema.wishImages.id, key: schema.wishImages.key, source: schema.wishImages.source })
          .from(schema.wishImages)
          .where(and(eq(schema.wishImages.wishId, job.id), eq(schema.wishImages.source, "page")));
        const inserted = await tx
          .insert(schema.wishImages)
          .values(
            images.map((image, position) => ({
              ...image,
              wishId: job.id,
              source: "page" as const,
              position,
            })),
          )
          .returning({ id: schema.wishImages.id });
        const showsPageImage = imageId === null || previous.some((image) => image.id === imageId);
        if (showsPageImage) imageId = inserted[0]?.id ?? null;
        await tx
          .update(schema.wishes)
          .set({ imageId, ...(showsPageImage ? { imageCrop: null } : {}) })
          .where(eq(schema.wishes.id, job.id));
        if (previous.length > 0) {
          await tx.delete(schema.wishImages).where(
            inArray(
              schema.wishImages.id,
              previous.map((image) => image.id),
            ),
          );
          stale.push(...previous.map((image) => image.key));
        }
      }
      const imageChanged = imageId !== current.imageId;

      await tx
        .update(schema.wishes)
        .set({ ...patch, enrichment: "done", ...(changed || imageChanged ? { updatedAt: now() } : {}) })
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
      if (imageChanged) {
        await tx.insert(schema.itemEvents).values({
          wishId: job.id,
          type: "image_changed",
          actorId: null,
          payload: { source: "page", proposals: images.length },
          visibility: "owner",
        });
      }
      return changed || images.length > 0 ? "done" : "unchanged";
    });
  } catch (error) {
    // The database refused: the files just put in the bucket are for nothing
    await removeFiles(
      storage,
      images.map((image) => image.key),
    );
    throw error;
  }
  await removeFiles(storage, stale);
  return outcome;
}
