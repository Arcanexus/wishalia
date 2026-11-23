import helmet from "@fastify/helmet";
import type { Database } from "@wishlist/db";
import type { HttpMetrics } from "@wishlist/metrics";
import Fastify, { type FastifyInstance } from "fastify";

import { createAuth } from "./auth/auth.js";
import type { Mailer } from "./auth/mailer.js";
import type { Config } from "./config.js";
import { registerErrorHandler } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { manageRoutes } from "./routes/manage/index.js";
import { publicRoutes } from "./routes/public.js";

export type Scope = "manage" | "public";

declare module "fastify" {
  interface FastifyRequest {
    /** Which API the request belongs to. The two scopes never share a route. */
    scope: Scope | null;
  }
}

/** Builds the API without listening, so that tests can call it with app.inject(). */
export interface AppDeps {
  db: Database;
  metrics?: HttpMetrics;
  mailer?: Mailer | undefined;
  /** The clock, for the reveal rules. Tests move it. */
  now?: () => Date;
}

export async function buildApp(
  config: Config,
  { db, metrics, mailer, now = () => new Date() }: AppDeps,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === "test" ? false : { level: config.LOG_LEVEL },
    // Behind the ingress controller, which terminates TLS
    trustProxy: true,
    // Ids are generated, never taken from the request
    genReqId: () => crypto.randomUUID(),
  });

  app.decorateRequest("scope", null);
  app.decorateRequest("user", null);
  registerErrorHandler(app);

  const auth = createAuth({ config, db, mailer, log: (message) => app.log.info(message) });

  if (metrics) {
    // The route pattern (/manage/items/:id), never the URL: no id in the metrics, bounded series
    app.addHook("onResponse", async (request, reply) => {
      metrics.observe({
        method: request.method,
        route: request.routeOptions.url,
        status: reply.statusCode,
        seconds: reply.elapsedTime / 1000,
      });
    });
  }

  // The API only serves JSON: the strictest CSP, no framing, no referrer
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    referrerPolicy: { policy: "no-referrer" },
  });

  await app.register(healthRoutes, { config, db });
  await app.register(authRoutes, { prefix: "/auth", auth, config });
  await app.register(manageRoutes, { prefix: "/manage", auth, db, now });
  await app.register(publicRoutes, { prefix: "/public" });

  return app;
}
