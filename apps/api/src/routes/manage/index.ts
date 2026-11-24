import type { Database } from "@wishalia/db";
import type { FastifyPluginAsync } from "fastify";

import type { Auth } from "../../auth/auth.js";
import { toHeaders } from "../../auth/fastify.js";
import type { Config } from "../../config.js";
import type { Images } from "../../images.js";
import { apiTokenRoutes } from "./api-tokens.js";
import { eventRoutes } from "./events.js";
import { itemRoutes } from "./items.js";
import { listRoutes } from "./lists.js";
import { meRoutes } from "./me.js";
import { shareLinkRoutes } from "./share-links.js";

/** What the routes of /manage need. `now` is injected so that tests can move the clock. */
export interface ManageDeps {
  db: Database;
  now: () => Date;
  /** The bucket and imgproxy, null when images are off. */
  images: Images | null;
}

/** What the share links also need: the public origin of their URL and the device marker secret. */
export interface ShareDeps extends ManageDeps {
  config: Config;
  secret: string;
}

export interface SessionUser {
  id: string;
  displayName: string;
  email: string;
}

declare module "fastify" {
  interface FastifyRequest {
    /** The signed-in person, set by the /manage guard. Null outside /manage. */
    user: SessionUser | null;
  }
}

/**
 * Routes of the management app (app.<product>.<domain>), for the owner of the lists. Every route
 * needs a session: the guard answers 401 before any handler runs.
 * Rule: no response of this scope ever carries contribution data (spec, section 3).
 */
export const manageRoutes: FastifyPluginAsync<ShareDeps & { auth: Auth }> = async (
  app,
  { auth, config, db, now, secret, images },
) => {
  app.addHook("onRequest", async (request, reply) => {
    request.scope = "manage";
    const session = await auth.api.getSession({ headers: toHeaders(request) });
    if (!session) {
      return reply.status(401).send({ error: "unauthenticated" });
    }
    // Better Auth calls it name; the column is display_name
    const { id, name, email } = session.user;
    request.user = { id, displayName: name, email };
  });

  app.get("/ping", async (request) => ({ scope: request.scope }));

  await app.register(meRoutes, { db, now, images });
  await app.register(listRoutes, { db, now, images });
  await app.register(itemRoutes, { db, now, images });
  await app.register(eventRoutes, { db, now, images });
  await app.register(shareLinkRoutes, { config, db, now, secret, images });
  await app.register(apiTokenRoutes, { db, now, images });
};
