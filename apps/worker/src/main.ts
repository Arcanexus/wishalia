import { createRegistry, metricsPort, startMetricsServer } from "@wishlist/metrics";

import { createHealthServer } from "./health.js";

// The job queue (pg-boss on PostgreSQL) and the enrichment jobs come with the enrichment step.
const port = Number(process.env.PORT ?? 3001);
let running = true;

const server = createHealthServer(() => running);
server.listen(port);

// Job metrics (queue depth, durations, failures) join this registry with the jobs themselves
const registry = createRegistry({ component: "worker", version: process.env.APP_VERSION ?? "dev" });
const metricsServer = await startMetricsServer(registry, metricsPort(), {
  onError: (error) => process.stderr.write(`metrics server failed to start: ${error.message}\n`),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    running = false;
    metricsServer?.close();
    server.close(() => process.exit(0));
  });
}
