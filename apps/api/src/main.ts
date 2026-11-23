import { createHttpMetrics, createRegistry, startMetricsServer } from "@wishlist/metrics";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const registry = createRegistry({ component: "api", version: config.APP_VERSION });
const app = await buildApp(config, { metrics: createHttpMetrics(registry) });
const metricsServer = await startMetricsServer(registry, config.METRICS_PORT, {
  onError: (error) => app.log.error({ err: error }, "metrics server failed to start"),
});

// Kubernetes sends SIGTERM before stopping the pod: finish the requests in flight
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    metricsServer?.close();
    void app.close().then(() => process.exit(0));
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
