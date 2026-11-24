import { createDb } from "@wishalia/db";
import { createHttpMetrics, createRegistry, startMetricsServer } from "@wishalia/metrics";
import { imageSettingsFromEnv, s3Storage } from "@wishalia/storage";

import { buildApp } from "./app.js";
import { smtpMailer } from "./auth/mailer.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
if (!config.DATABASE_URL) {
  throw new Error("Invalid configuration:\n- DATABASE_URL: required");
}
const database = createDb({ url: config.DATABASE_URL });
const registry = createRegistry({ component: "api", version: config.APP_VERSION });
const mailer =
  config.SMTP_URL && config.MAIL_FROM ? smtpMailer(config.SMTP_URL, config.MAIL_FROM) : undefined;
// The images (docs/images.md): with the S3 bucket and imgproxy only; checked at start-up
const imageSettings = imageSettingsFromEnv();
const images = imageSettings
  ? { storage: s3Storage(imageSettings.s3), imgproxy: imageSettings.imgproxy }
  : null;
const app = await buildApp(config, { db: database.db, metrics: createHttpMetrics(registry), mailer, images });
if (!config.AUTH_SECRET) {
  app.log.warn("AUTH_SECRET is not set: sessions end when the API restarts (development only)");
}
const metricsServer = await startMetricsServer(registry, config.METRICS_PORT, {
  onError: (error) => app.log.error({ err: error }, "metrics server failed to start"),
});

// Kubernetes sends SIGTERM before stopping the pod: finish the requests in flight
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    metricsServer?.close();
    void app
      .close()
      .then(() => database.close())
      .then(() => process.exit(0));
  });
}

await app.listen({ host: config.HOST, port: config.PORT });
