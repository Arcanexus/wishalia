import { schema } from "@wishalia/db";
import { and, eq } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { notFound, parse, userId } from "../../http.js";
import { listLive } from "../../live.js";
import type { ManageDeps } from "./index.js";

const listParams = z.object({ listId: z.uuid() });

/**
 * What changed in a list, in a few bytes (docs/live-updates.md): the management app asks it every
 * few seconds while the worker completes items, and loads the list again when the version moves.
 */
export const liveRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db }) => {
  app.get("/lists/:listId/live", async (request, reply) => {
    const { listId } = parse(listParams, request.params);
    const [list] = await db
      .select({ id: schema.wishLists.id })
      .from(schema.wishLists)
      .where(and(eq(schema.wishLists.id, listId), eq(schema.wishLists.ownerId, userId(request))));
    if (!list) throw notFound();
    reply.header("cache-control", "private, no-store");
    return listLive(db, list.id);
  });
};
