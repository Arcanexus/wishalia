import { type Database, ping } from "@wishalia/db";
import type { FastifyPluginAsync } from "fastify";

import type { Config } from "../config.js";

/** Liveness and readiness probes, used by the Kubernetes Deployment. */
export const healthRoutes: FastifyPluginAsync<{ config: Config; db: Database }> = async (
  app,
  { config, db },
) => {
  // Liveness: the process answers. Never checks the database, so that a database outage does not
  // make Kubernetes restart every pod.
  app.get("/healthz", async () => ({ status: "ok", name: config.APP_NAME, version: config.APP_VERSION }));
  // Readiness: the database answers too, otherwise the pod leaves the Service until it does.
  app.get("/readyz", async (_request, reply) => {
    try {
      await ping(db);
      return { status: "ready" };
    } catch {
      return reply.status(503).send({ status: "database unavailable" });
    }
  });
};
