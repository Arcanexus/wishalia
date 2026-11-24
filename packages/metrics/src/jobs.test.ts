import { describe, expect, it } from "vitest";

import { createEnrichmentMetrics } from "./jobs.js";
import { createRegistry } from "./registry.js";

describe("createEnrichmentMetrics", () => {
  it("counts the jobs by outcome and times them, with no other label", async () => {
    const registry = createRegistry({ component: "worker", version: "test", defaultMetrics: false });
    const metrics = createEnrichmentMetrics(registry);
    metrics.observe("done", 0.4);
    metrics.observe("retry", 3);
    const text = await registry.metrics();
    expect(text).toContain('wishalia_enrichment_jobs_total{outcome="done",component="worker"} 1');
    expect(text).toContain('wishalia_enrichment_jobs_total{outcome="failed",component="worker"} 0');
    expect(text).toContain('wishalia_enrichment_duration_seconds_count{component="worker"} 2');
  });
});
