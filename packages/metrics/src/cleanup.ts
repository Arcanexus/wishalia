import { Counter, Gauge, type Registry } from "prom-client";

import { PREFIX } from "./registry.js";

export interface CleanupMetrics {
  /** One sweep of the image files: how many it looked at and removed, or that it failed. */
  observe(result: { checked: number; removed: number } | "error"): void;
}

/** The worker's cleanup of the image files no image names any more (docs/images.md). */
export function createCleanupMetrics(registry: Registry): CleanupMetrics {
  const runs = new Counter({
    name: `${PREFIX}image_cleanup_runs_total`,
    help: "Sweeps of the image storage for unused files, by outcome.",
    labelNames: ["outcome"],
    registers: [registry],
  });
  const removed = new Counter({
    name: `${PREFIX}image_cleanup_removed_total`,
    help: "Unused image files removed from the storage.",
    registers: [registry],
  });
  const checked = new Gauge({
    name: `${PREFIX}image_cleanup_checked_files`,
    help: "Files the last successful sweep looked at.",
    registers: [registry],
  });
  const last = new Gauge({
    name: `${PREFIX}image_cleanup_last_success_timestamp_seconds`,
    help: "When the last successful sweep ended (Unix time).",
    registers: [registry],
  });
  for (const outcome of ["ok", "error"]) runs.inc({ outcome }, 0);
  removed.inc(0);
  return {
    observe(result) {
      if (result === "error") {
        runs.inc({ outcome: "error" });
        return;
      }
      runs.inc({ outcome: "ok" });
      removed.inc(result.removed);
      checked.set(result.checked);
      last.set(Date.now() / 1000);
    },
  };
}
