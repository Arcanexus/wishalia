import { schema } from "@wishlist/db";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { first, notFound, parse, userId } from "../../http.js";
import type { ManageDeps } from "./index.js";
import { ownerItem, ownerList } from "./serialize.js";

export const listInput = z.object({ name: z.string().trim().min(1).max(100) });
const listPatch = z
  .object({
    name: z.string().trim().min(1).max(100),
    position: z.number().int().min(0),
    archived: z.boolean(),
    /** Forced on everyone who opens the list; null lets each person's theme apply. */
    theme: z.enum(["neutral", "christmas"]).nullable(),
  })
  .partial()
  .strict();
const idParams = z.object({ listId: z.uuid() });

/** The default list of a new owner, created by the first quick add. */
export const DEFAULT_LIST_NAME = "Mes envies";

export const listRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db }) => {
  /** The owner's lists, in their order, with the number of open items. */
  app.get("/lists", async (request) => {
    const ownerId = userId(request);
    const rows = await db
      .select({ list: schema.wishLists, items: count(schema.wishes.id) })
      .from(schema.wishLists)
      .leftJoin(
        schema.wishes,
        and(eq(schema.wishes.listId, schema.wishLists.id), eq(schema.wishes.status, "open")),
      )
      .where(and(eq(schema.wishLists.ownerId, ownerId), isNull(schema.wishLists.archivedAt)))
      .groupBy(schema.wishLists.id)
      .orderBy(asc(schema.wishLists.position), asc(schema.wishLists.createdAt));
    return rows.map((row) => ownerList(row.list, row.items));
  });

  app.post("/lists", async (request, reply) => {
    const { name } = parse(listInput, request.body);
    const ownerId = userId(request);
    const list = first(
      await db
        .insert(schema.wishLists)
        .values({
          ownerId,
          name,
          position: sql`(SELECT coalesce(max(${schema.wishLists.position}) + 1, 0) FROM ${schema.wishLists} WHERE ${schema.wishLists.ownerId} = ${ownerId})`,
        })
        .returning(),
    );
    return reply.status(201).send(ownerList(list, 0));
  });

  app.patch("/lists/:listId", async (request) => {
    const { listId } = parse(idParams, request.params);
    const patch = parse(listPatch, request.body);
    const [list] = await db
      .update(schema.wishLists)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.position !== undefined ? { position: patch.position } : {}),
        ...(patch.archived !== undefined ? { archivedAt: patch.archived ? new Date() : null } : {}),
        ...(patch.theme !== undefined ? { theme: patch.theme } : {}),
      })
      .where(and(eq(schema.wishLists.id, listId), eq(schema.wishLists.ownerId, userId(request))))
      .returning();
    if (!list) throw notFound();
    return ownerList(list, 0);
  });

  /** The items of a list, open ones first in their order, then received and archived ones. */
  app.get("/lists/:listId/items", async (request) => {
    const { listId } = parse(idParams, request.params);
    const [list] = await db
      .select({ id: schema.wishLists.id })
      .from(schema.wishLists)
      .where(and(eq(schema.wishLists.id, listId), eq(schema.wishLists.ownerId, userId(request))));
    if (!list) throw notFound();
    const rows = await db
      .select()
      .from(schema.wishes)
      .where(eq(schema.wishes.listId, listId))
      .orderBy(
        sql`CASE ${schema.wishes.status} WHEN 'open' THEN 0 WHEN 'received' THEN 1 ELSE 2 END`,
        asc(schema.wishes.position),
        asc(schema.wishes.createdAt),
      );
    return rows.map(ownerItem);
  });
};
