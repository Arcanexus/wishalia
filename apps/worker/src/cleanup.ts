import { schema, type Database } from "@wishalia/db";
import type { CleanupMetrics } from "@wishalia/metrics";
import type { Storage } from "@wishalia/storage";
import { inArray } from "drizzle-orm";

/**
 * The cleanup of the image files (docs/images.md). A file is unused when no wish_images row names
 * it: a write cut between the file and its row, a removal of the file that failed after its row
 * was gone, a file left half written. Every image a person can still see or choose has its row,
 * so it is never touched. The grace period spares the files whose row is about to be written (an
 * upload, a page being read): a file is only removed once it is older than that.
 */

/** Everything Wishalia writes lives under this prefix. */
export const IMAGE_PREFIX = "wishes/";
const HOUR_MS = 3_600_000;

export interface CleanupSettings {
  /** Time between two sweeps; 0 turns the cleanup off. */
  intervalMs: number;
  /** A file younger than this is never removed. */
  graceMs: number;
}

/** IMAGE_CLEANUP_INTERVAL_HOURS (6 by default, 0: off) and IMAGE_CLEANUP_GRACE_HOURS (24, 1 at least). */
export function cleanupSettingsFromEnv(env: NodeJS.ProcessEnv = process.env): CleanupSettings {
  const hours = (name: string, fallback: number, min: number) => {
    const raw = env[name]?.trim();
    if (!raw) return fallback;
    const value = Number(raw);
    if (!Number.isFinite(value) || value < min)
      throw new Error(`Invalid configuration:\n- ${name}: a number of hours, ${min} or more`);
    return value;
  };
  return {
    intervalMs: hours("IMAGE_CLEANUP_INTERVAL_HOURS", 6, 0) * HOUR_MS,
    graceMs: hours("IMAGE_CLEANUP_GRACE_HOURS", 24, 1) * HOUR_MS,
  };
}

export interface SweepDeps {
  db: Database;
  storage: Storage;
  graceMs: number;
  now?: () => Date;
  /** Checked between pages: a worker that stops ends the sweep early. */
  isRunning?: () => boolean;
}

export interface SweepResult {
  checked: number;
  removed: number;
  /** Files that could not be removed: the next sweep tries again. */
  failed: number;
}

/** One pass over the storage, a page of files at a time (one query per page). */
export async function sweepImages({
  db,
  storage,
  graceMs,
  now = () => new Date(),
  isRunning = () => true,
}: SweepDeps): Promise<SweepResult> {
  const result: SweepResult = { checked: 0, removed: 0, failed: 0 };
  const before = now().getTime() - graceMs;
  for await (const page of storage.list(IMAGE_PREFIX)) {
    if (!isRunning()) break;
    result.checked += page.length;
    const old = page.filter((object) => object.modifiedAt.getTime() < before);
    if (old.length === 0) continue;
    const named = await db
      .select({ key: schema.wishImages.key })
      .from(schema.wishImages)
      .where(
        inArray(
          schema.wishImages.key,
          old.map((object) => object.key),
        ),
      );
    const kept = new Set(named.map((row) => row.key));
    const unused = old.filter((object) => !kept.has(object.key));
    const removals = await Promise.allSettled(unused.map((object) => storage.delete(object.key)));
    for (const removal of removals) {
      if (removal.status === "fulfilled") result.removed += 1;
      else result.failed += 1;
    }
  }
  return result;
}

export interface CleanupOptions extends Omit<SweepDeps, "isRunning">, CleanupSettings {
  metrics?: CleanupMetrics;
  log?: (message: string) => void;
  /** The wait before the first sweep: the worker starts its queue first. */
  firstDelayMs?: number;
}

/**
 * Sweeps now and then while the worker runs. Several replicas may sweep at the same time: the
 * removals are idempotent, and a file one of them removes is a file the others would remove too.
 */
export function startCleanup({
  intervalMs,
  firstDelayMs = 5 * 60_000,
  metrics,
  log = () => undefined,
  ...deps
}: CleanupOptions): { stop(): Promise<void> } {
  let running = true;
  let timer: NodeJS.Timeout | undefined;
  let current: Promise<void> = Promise.resolve();
  if (intervalMs <= 0) return { stop: async () => undefined };

  const run = async () => {
    try {
      const result = await sweepImages({ ...deps, isRunning: () => running });
      metrics?.observe(result);
      if (result.removed > 0 || result.failed > 0)
        log(
          `image cleanup: ${result.removed} unused file(s) removed, ${result.failed} left for the next sweep`,
        );
    } catch (error) {
      metrics?.observe("error");
      log(`image cleanup: ${(error as Error).message}`);
    }
  };
  const schedule = (delay: number) => {
    if (!running) return;
    timer = setTimeout(() => {
      current = run().finally(() => schedule(intervalMs));
    }, delay);
    timer.unref();
  };
  schedule(firstDelayMs);
  return {
    async stop() {
      running = false;
      clearTimeout(timer);
      await current;
    },
  };
}
