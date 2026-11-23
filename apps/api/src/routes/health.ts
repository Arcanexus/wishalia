import type { FastifyPluginAsync } from "fastify";

import type { Config } from "../config.js";

/** Liveness and readiness probes, used by the Kubernetes Deployment. */
export const healthRoutes: FastifyPluginAsync<{ config: Config }> = async (app, { config }) => {
  app.get("/healthz", async () => ({ status: "ok", name: config.APP_NAME, version: config.APP_VERSION }));
  // Ready as soon as the server listens; the database check comes with the data model.
  app.get("/readyz", async () => ({ status: "ready" }));
};
