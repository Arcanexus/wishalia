import { type Database, schema } from "@wishalia/db";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import type { Config } from "../../config.js";
import type { Images } from "../../images.js";
import { createRateLimiter } from "../../rate-limit.js";
import { hashToken } from "../../tokens.js";
import { isApiTokenActive, isWellFormedApiToken } from "../manage/api-tokens.js";
import { eventRoutes } from "../manage/events.js";
import { itemRoutes } from "../manage/items.js";
import { listRoutes } from "../manage/lists.js";
import { openApiDocument } from "./openapi.js";

export interface V1Deps {
  config: Config;
  db: Database;
  now: () => Date;
  images: Images | null;
}

/** lastUsedAt is written at most once a minute per token, not on every request. */
const LAST_USED_PRECISION_MS = 60_000;
const READ_METHODS = new Set(["GET", "HEAD"]);

/**
 * The REST API v1 (spec §8.2), on its own host, for scripts and home automation. It authenticates
 * by personal access token only (`Authorization: Bearer wsh_...`), never by cookie, so no browser
 * session can be ridden. It has the rights of /manage, through the same routes, and so never
 * returns contribution data. A read-only token only reads.
 */
export const v1Routes: FastifyPluginAsync<V1Deps> = async (app, { config, db, now, images }) => {
  const limiter = createRateLimiter(config.API_RATE_LIMIT);

  app.addHook("onRequest", async (request) => {
    request.scope = "v1";
  });

  /** The OpenAPI description, open: it describes the routes, not any data. */
  app.get("/openapi.json", async () => openApiDocument(config));

  await app.register(async (secured) => {
    secured.addHook("onRequest", async (request, reply) => {
      const at = now();
      const header = request.headers.authorization ?? "";
      const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
      const [row] = isWellFormedApiToken(token)
        ? await db
            .select()
            .from(schema.apiTokens)
            .where(eq(schema.apiTokens.tokenHash, hashToken(token)))
        : [];

      // Counted per token, or per address while the token is wrong: guessing is slowed down too
      const limit = limiter.hit(row ? `token:${row.id}` : `ip:${request.ip}`, at);
      reply.header("ratelimit-limit", config.API_RATE_LIMIT);
      reply.header("ratelimit-remaining", limit.remaining);
      reply.header("ratelimit-reset", limit.resetSeconds);
      if (!limit.allowed) {
        reply.header("retry-after", limit.resetSeconds);
        return reply.status(429).send({ error: "rate_limited" });
      }

      if (!row || !isApiTokenActive(row, at)) {
        reply.header("www-authenticate", 'Bearer realm="wishalia"');
        return reply.status(401).send({ error: "invalid_token" });
      }
      if (row.readOnly && !READ_METHODS.has(request.method)) {
        return reply.status(403).send({ error: "read_only_token" });
      }
      const [user] = await db
        .select({ id: schema.users.id, displayName: schema.users.displayName, email: schema.users.email })
        .from(schema.users)
        .where(eq(schema.users.id, row.ownerId));
      if (!user) {
        return reply.status(401).send({ error: "invalid_token" });
      }
      if (!row.lastUsedAt || at.getTime() - row.lastUsedAt.getTime() >= LAST_USED_PRECISION_MS) {
        await db.update(schema.apiTokens).set({ lastUsedAt: at }).where(eq(schema.apiTokens.id, row.id));
      }
      request.user = { id: user.id, displayName: user.displayName, email: user.email ?? "" };
    });

    secured.get("/me", async (request) => request.user);
    await secured.register(listRoutes, { db, now, images, publicOrigin: config.PUBLIC_ORIGIN });
    await secured.register(itemRoutes, { db, now, images });
    await secured.register(eventRoutes, { db, now, images });
  });
};
