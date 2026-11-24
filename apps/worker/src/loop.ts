import type { EnrichmentMetrics } from "@wishalia/metrics";

import { enrichNext, type JobDeps } from "./jobs.js";

export interface LoopOptions extends JobDeps {
  metrics?: EnrichmentMetrics;
  /** The wait when the queue is empty, or after an unexpected error. */
  idleMs?: number;
  isRunning: () => boolean;
  sleep?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Takes the items to complete one after the other while the worker runs: straight on while there
 * are some, every `idleMs` otherwise (an indexed query on an empty queue costs next to nothing).
 */
export async function runLoop({
  metrics,
  idleMs = 2_000,
  isRunning,
  sleep = wait,
  log = () => undefined,
  ...deps
}: LoopOptions): Promise<void> {
  while (isRunning()) {
    const started = performance.now();
    try {
      const outcome = await enrichNext(deps);
      if (outcome === "idle") {
        await sleep(idleMs);
        continue;
      }
      metrics?.observe(outcome, (performance.now() - started) / 1000);
    } catch (error) {
      // The database is away, most likely: wait, then try again (never the link, never the item)
      log(`enrichment loop: ${(error as Error).message}`);
      await sleep(idleMs * 5);
    }
  }
}
