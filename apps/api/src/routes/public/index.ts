import type { Database } from "@wishalia/db";
import { schema } from "@wishalia/db";
import { isShareLinkActive, resolveViewer, type ViewerRole } from "@wishalia/domain";
import { and, eq, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";

import type { Auth } from "../../auth/auth.js";
import { toHeaders } from "../../auth/fastify.js";
import type { Config } from "../../config.js";
import type { Images } from "../../images.js";
import {
  deviceMarkerCookieName,
  hashToken,
  isWellFormedToken,
  readCookie,
  readDeviceMarker,
} from "../../tokens.js";
import { createRateLimiter } from "../../rate-limit.js";
import { contributionRoutes } from "./contributions.js";
import { homeRoutes } from "./home.js";
import { viewRoutes } from "./view.js";

export interface PublicDeps {
  auth: Auth;
  config: Config;
  db: Database;
  now: () => Date;
  secret: string;
  images: Images | null;
}

/** Gifts per minute and per address through the open link of a public list. */
export const OPEN_LINK_GIFTS_PER_MINUTE = 5;

/** The header that carries the token of the share link. Never the URL: no token in the access logs. */
export const SHARE_TOKEN_HEADER = "x-share-token";

export interface ShareContext {
  link: typeof schema.shareLinks.$inferSelect;
  /** The open link of a public list: anyone may be looking, so the guests' names stay out. */
  open: boolean;
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
  const { auth, config, db, now, secret, images } = deps;
  // Anyone may give through an open link: a few gifts a minute per address, so that nobody
  // reserves a whole list in one go
  const openLinkLimiter = createRateLimiter(OPEN_LINK_GIFTS_PER_MINUTE);
  app.addHook("onRequest", async (request) => {
    request.scope = "public";
  });
  app.get("/ping", async (request) => ({ scope: request.scope }));
  // The home page (« Trouver une liste »): the public lists only, no share link needed
  await app.register(homeRoutes, { auth, db });

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
      // An open link only opens a list that is still public (revoked when it turns private; this
      // holds even if a revocation was missed)
      if (link.openToken !== null) {
        const [list] = link.listId
          ? await db
              .select({ id: schema.wishLists.id })
              .from(schema.wishLists)
              .where(
                and(
                  eq(schema.wishLists.id, link.listId),
                  eq(schema.wishLists.visibility, "public"),
                  isNull(schema.wishLists.archivedAt),
                ),
              )
          : [];
        if (!list) return reply.status(404).send({ error: "link_not_found" });
      }
      const session = await auth.api.getSession({ headers: toHeaders(request) });
      const deviceMarkerUserIds = readDeviceMarker(
        secret,
        readCookie(request.headers.cookie, deviceMarkerCookieName(config)),
      );
      request.share = {
        link,
        open: link.openToken !== null,
        viewer: resolveViewer({
          ownerId: link.ownerId,
          sessionUserId: session?.user.id ?? null,
          deviceMarkerUserIds,
          hasValidShareLink: true,
        }),
        sessionUser: session ? { id: session.user.id, displayName: session.user.name } : null,
      };
    });
    await shared.register(viewRoutes, { db, now, images });
    await shared.register(contributionRoutes, { db, now, openLinkLimiter });
  });
};
