import helmet from "@fastify/helmet";
import Fastify, { type FastifyInstance } from "fastify";

import type { Config } from "./config.js";
import { healthRoutes } from "./routes/health.js";
import { manageRoutes } from "./routes/manage.js";
import { publicRoutes } from "./routes/public.js";

export type Scope = "manage" | "public";

declare module "fastify" {
  interface FastifyRequest {
    /** Which API the request belongs to. The two scopes never share a route. */
    scope: Scope | null;
  }
}

/** Builds the API without listening, so that tests can call it with app.inject(). */
export async function buildApp(config: Config): Promise<FastifyInstance> {
  const app = Fastify({
    logger: config.NODE_ENV === "test" ? false : { level: config.LOG_LEVEL },
    // Behind the ingress controller, which terminates TLS
    trustProxy: true,
    // Ids are generated, never taken from the request
    genReqId: () => crypto.randomUUID(),
  });

  app.decorateRequest("scope", null);

  // The API only serves JSON: the strictest CSP, no framing, no referrer
  await app.register(helmet, {
    contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
    referrerPolicy: { policy: "no-referrer" },
  });

  await app.register(healthRoutes, { config });
  await app.register(manageRoutes, { prefix: "/manage" });
  await app.register(publicRoutes, { prefix: "/public" });

  return app;
}
