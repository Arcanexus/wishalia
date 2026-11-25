import { createDb } from "@wishalia/db";
import {
  createCleanupMetrics,
  createEnrichmentMetrics,
  createRegistry,
  metricsPort,
  startMetricsServer,
} from "@wishalia/metrics";

import { imageSettingsFromEnv, openStorage } from "@wishalia/storage";

import { cleanupSettingsFromEnv, startCleanup } from "./cleanup.js";
import { fetchImage, fetchPage } from "./fetch.js";
import { createHealthServer } from "./health.js";
import { runLoop } from "./loop.js";

// The enrichment queue lives in the database (docs/enrichment.md): the worker needs DATABASE_URL
const { db, close } = createDb({ url: process.env.DATABASE_URL ?? "", maxConnections: 2 });
const port = Number(process.env.PORT ?? 3001);
let running = true;

// The images of the pages (docs/images.md): only with a bucket or a volume, and imgproxy, configured
const images = imageSettingsFromEnv();
const cleanupSettings = cleanupSettingsFromEnv();
const storage = images ? openStorage(images.storage) : null;
await storage?.ensureBucket().catch((error: Error) => {
  process.stderr.write(`image storage not ready (${error.message}): images will be retried with each item\n`);
});

const server = createHealthServer(() => running);
server.listen(port);

const registry = createRegistry({ component: "worker", version: process.env.APP_VERSION ?? "dev" });
const metrics = createEnrichmentMetrics(registry);
const metricsServer = await startMetricsServer(registry, metricsPort(), {
  onError: (error) => process.stderr.write(`metrics server failed to start: ${error.message}\n`),
});

const loop = runLoop({
  db,
  fetchPage: (url) => fetchPage(url),
  storage,
  fetchImage: (url) => fetchImage(url),
  metrics,
  isRunning: () => running,
  log: (message) => process.stderr.write(`${message}\n`),
});

// The files no image names any more, now and then (docs/images.md)
const cleanup = storage
  ? startCleanup({
      db,
      storage,
      ...cleanupSettings,
      metrics: createCleanupMetrics(registry),
      log: (message) => process.stderr.write(`${message}\n`),
    })
  : null;

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    running = false;
    metricsServer?.close();
    // The job under way ends first (a page takes 10 s at most), then the connections close
    void Promise.allSettled([loop, cleanup?.stop()]).finally(async () => {
      await close();
      server.close(() => process.exit(0));
    });
  });
}
