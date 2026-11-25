import { describe, expect, it } from "vitest";

import { createCleanupMetrics } from "./cleanup.js";
import { createRegistry } from "./registry.js";

describe("createCleanupMetrics", () => {
  it("counts the sweeps and the files removed, with no file or item label", async () => {
    const registry = createRegistry({ component: "worker", version: "test", defaultMetrics: false });
    const metrics = createCleanupMetrics(registry);
    expect(await registry.metrics()).toContain(
      'wishalia_image_cleanup_runs_total{outcome="error",component="worker"} 0',
    );
    metrics.observe({ checked: 12, removed: 3 });
    metrics.observe({ checked: 9, removed: 0 });
    metrics.observe("error");
    const text = await registry.metrics();
    expect(text).toContain('wishalia_image_cleanup_runs_total{outcome="ok",component="worker"} 2');
    expect(text).toContain('wishalia_image_cleanup_runs_total{outcome="error",component="worker"} 1');
    expect(text).toContain('wishalia_image_cleanup_removed_total{component="worker"} 3');
    expect(text).toContain('wishalia_image_cleanup_checked_files{component="worker"} 9');
    expect(text).toMatch(/wishalia_image_cleanup_last_success_timestamp_seconds\{component="worker"\} \d+/);
  });
});
