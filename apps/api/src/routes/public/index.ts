import type { Database } from "@wishalia/db";
import { schema } from "@wishalia/db";
import { isShareLinkActive, resolveViewer, type ViewerRole } from "@wishalia/domain";
import { eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import type { Auth } from "../../auth/auth.js";
import { toHeaders } from "../../auth/fastify.js";
import type { Config } from "../../config.js";
import {
  deviceMarkerCookieName,
  hashToken,
  isWellFormedToken,
  readCookie,
  readDeviceMarker,
} from "../../tokens.js";
import { contributionRoutes } from "./contributions.js";
import { viewRoutes } from "./view.js";

export interface PublicDeps {
  auth: Auth;
  config: Config;
  db: Database;
  now: () => Date;
  secret: string;
}

/** The header that carries the token of the share link. Never the URL: no token in the access logs. */
export const SHARE_TOKEN_HEADER = "x-share-token";

export interface ShareContext {
  link: typeof schema.shareLinks.$inferSelect;
  /** Who is looking, by the single rule (resolveViewer): the owner wins over the link. */
  viewer: ViewerRole;
  /** The signed-in person, when there is a session (a family member with an account). */
  sessionUser: { id: string; displayName: string } | null;
}

declare module "fastify" {
  interface FastifyRequest {
    /** The share link of a /public request, set by its guard. Null elsewhere. */
    share: ShareContext | null;
  }
}

/**
 * Routes of the public view (<product>.<domain>), reached through share links. Every route but
 * /ping needs a valid link: unknown, revoked and expired links all answer the same 404.
 * Contributions are only returned after the single anti-spoil check (canSeeContributions).
 */
export const publicRoutes: FastifyPluginAsync<PublicDeps> = async (app, deps) => {
  const { auth, config, db, now, secret } = deps;
  app.addHook("onRequest", async (request) => {
    request.scope = "public";
  });
  app.get("/ping", async (request) => ({ scope: request.scope }));

  await app.register(async (shared) => {
    shared.addHook("onRequest", async (request, reply) => {
      const token = request.headers[SHARE_TOKEN_HEADER];
      const [link] = isWellFormedToken(token)
        ? await db
            .select()
            .from(schema.shareLinks)
            .where(eq(schema.shareLinks.tokenHash, hashToken(token)))
        : [];
      if (!link || !isShareLinkActive(link, now())) {
        return reply.status(404).send({ error: "link_not_found" });
      }
      const session = await auth.api.getSession({ headers: toHeaders(request) });
      const deviceMarkerUserIds = readDeviceMarker(
        secret,
        readCookie(request.headers.cookie, deviceMarkerCookieName(config)),
      );
      request.share = {
        link,
        viewer: resolveViewer({
          ownerId: link.ownerId,
          sessionUserId: session?.user.id ?? null,
          deviceMarkerUserIds,
          hasValidShareLink: true,
        }),
        sessionUser: session ? { id: session.user.id, displayName: session.user.name } : null,
      };
    });
    await shared.register(viewRoutes, { db, now });
    await shared.register(contributionRoutes, { db, now });
  });
};
