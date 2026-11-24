import { Counter, Histogram, type Registry } from "prom-client";

import { PREFIX } from "./registry.js";

/** How an enrichment job ended: one series each, never an item, a link or a site. */
export const ENRICHMENT_OUTCOMES = ["done", "unchanged", "retry", "failed", "skipped"] as const;
export type EnrichmentOutcome = (typeof ENRICHMENT_OUTCOMES)[number];

export interface EnrichmentMetrics {
  observe(outcome: EnrichmentOutcome, seconds: number): void;
}

/** The worker's enrichment jobs: how many, how they ended, how long they took. */
export function createEnrichmentMetrics(registry: Registry): EnrichmentMetrics {
  const jobs = new Counter({
    name: `${PREFIX}enrichment_jobs_total`,
    help: "Items completed from their link, by outcome.",
    labelNames: ["outcome"],
    registers: [registry],
  });
  const duration = new Histogram({
    name: `${PREFIX}enrichment_duration_seconds`,
    help: "Duration of an enrichment job, page fetch included.",
    buckets: [0.1, 0.25, 0.5, 1, 2, 5, 10, 20],
    registers: [registry],
  });
  for (const outcome of ENRICHMENT_OUTCOMES) jobs.inc({ outcome }, 0);
  return {
    observe(outcome, seconds) {
      jobs.inc({ outcome });
      duration.observe(seconds);
    },
  };
}
