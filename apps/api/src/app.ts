import helmet from "@fastify/helmet";
import type { Database } from "@wishalia/db";
import { negotiateLocale, type Locale } from "@wishalia/i18n";
import type { HttpMetrics } from "@wishalia/metrics";
import Fastify, { type FastifyInstance } from "fastify";

import { authSecret, createAuth } from "./auth/auth.js";
import type { Mailer } from "./auth/mailer.js";
import type { Config } from "./config.js";
import type { Images } from "./images.js";
import { createPageFetcher, type FetchPage } from "./remote.js";
import { registerErrorHandler } from "./http.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { manageRoutes } from "./routes/manage/index.js";
import { publicRoutes } from "./routes/public/index.js";
import { v1Routes } from "./routes/v1/index.js";

export type Scope = "manage" | "public" | "v1";

declare module "fastify" {
  interface FastifyRequest {
    /** Which API the request belongs to. The two scopes never share a route. */
    scope: Scope | null;
    /** The language of the request (Accept-Language, then DEFAULT_LOCALE), for the words it stores. */
    locale: Locale;
  }
}

/** Builds the API without listening, so that tests can call it with app.inject(). */
export interface AppDeps {
  db: Database;
  metrics?: HttpMetrics;
  mailer?: Mailer | undefined;
  /** The clock, for the reveal rules. Tests move it. */
  now?: () => Date;
  /** The S3 bucket and imgproxy (docs/images.md); without them, items have no image. */
  images?: Images | null;
  /** Reads the public page of a list on another service, for an import (docs/import.md). */
  fetchPage?: FetchPage;
}

export async function buildApp(
  config: Config,
  { db, metrics, mailer, now = () => new Date(), images = null, fetchPage = createPageFetcher() }: AppDeps,
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
  app.decorateRequest("share", null);
  app.decorateRequest("locale", config.DEFAULT_LOCALE);
  app.addHook("onRequest", async (request) => {
    request.locale = negotiateLocale(request.headers["accept-language"], config.DEFAULT_LOCALE);
  });
  registerErrorHandler(app);

  const secret = authSecret(config);
  const auth = createAuth({ config, db, mailer, secret, log: (message) => app.log.info(message) });

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
  await app.register(manageRoutes, { prefix: "/manage", auth, config, db, now, secret, images, fetchPage });
  await app.register(publicRoutes, { prefix: "/public", auth, config, db, now, secret, images });
  if (config.API_ORIGIN) {
    const apiHost = new URL(config.API_ORIGIN).host;
    // The ingress only forwards /v1 on the API host; the API checks it too, so that the internal
    // routes never answer there
    app.addHook("onRequest", async (request, reply) => {
      if (request.host === apiHost && !request.url.startsWith("/v1/")) {
        return reply.status(404).send({ error: "not_found" });
      }
    });
    await app.register(v1Routes, { prefix: "/v1", config, db, now, images });
  }

  return app;
}
