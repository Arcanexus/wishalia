import { type Database, schema } from "@wishalia/db";
import { matchesSearch, MAX_SEARCH_RESULTS, searchWords } from "@wishalia/domain";
import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import type { Auth } from "../../auth/auth.js";
import { toHeaders } from "../../auth/fastify.js";
import { parse } from "../../http.js";
import { SHARE_PATH } from "../manage/lists.js";

/** The most public lists searched at once: a family's instance has far fewer. */
const SEARCHED_LISTS = 500;

const homeQuery = z.object({ q: z.string().max(200).optional() });

/**
 * The home page of the public host: who is signed in, and the public lists (« Trouver une
 * liste »). A private list is never here, whatever is searched: only the lists their owner made
 * public, not archived, with their open link. Each result gives the owner's name, the list's name,
 * how many wishes are open, and the address of its open link: never anything about a gift.
 */
export const homeRoutes: FastifyPluginAsync<{ auth: Auth; db: Database }> = async (app, { auth, db }) => {
  app.get("/home", async (request, reply) => {
    const { q = "" } = parse(homeQuery, request.query);
    const words = searchWords(q);
    const session = await auth.api.getSession({ headers: toHeaders(request) });

    const rows = await db
      .select({
        name: schema.wishLists.name,
        ownerName: schema.users.displayName,
        token: schema.shareLinks.openToken,
        createdAt: schema.wishLists.createdAt,
        items: count(schema.wishes.id),
      })
      .from(schema.wishLists)
      .innerJoin(schema.users, eq(schema.users.id, schema.wishLists.ownerId))
      .innerJoin(
        schema.shareLinks,
        and(
          eq(schema.shareLinks.listId, schema.wishLists.id),
          isNotNull(schema.shareLinks.openToken),
          isNull(schema.shareLinks.revokedAt),
        ),
      )
      .leftJoin(
        schema.wishes,
        and(eq(schema.wishes.listId, schema.wishLists.id), eq(schema.wishes.status, "open")),
      )
      .where(and(eq(schema.wishLists.visibility, "public"), isNull(schema.wishLists.archivedAt)))
      .groupBy(schema.wishLists.id, schema.users.displayName, schema.shareLinks.openToken)
      .orderBy(desc(schema.wishLists.createdAt))
      .limit(SEARCHED_LISTS);

    const found = rows.filter((row) => !words || matchesSearch(words, [row.ownerName, row.name]));
    // Who is signed in changes the page: never in a shared cache
    reply.header("cache-control", "private, no-store");
    return {
      me: session ? { displayName: session.user.name } : null,
      query: words ? q.trim().slice(0, 80) : "",
      lists: found.slice(0, MAX_SEARCH_RESULTS).map((row) => ({
        name: row.name,
        ownerName: row.ownerName,
        itemCount: row.items,
        path: `${SHARE_PATH}${row.token}`,
      })),
      more: found.length > MAX_SEARCH_RESULTS,
    };
  });
};
