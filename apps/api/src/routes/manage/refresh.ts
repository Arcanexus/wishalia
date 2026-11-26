import { schema } from "@wishalia/db";
import { refreshSchedule } from "@wishalia/domain";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { recordHistory } from "../../history.js";
import { first, HttpError, notFound, parse, userId } from "../../http.js";
import { imageOf } from "../../images.js";
import { createRateLimiter } from "../../rate-limit.js";
import type { ManageDeps } from "./index.js";
import { ownedItem } from "./items.js";
import { ownerItem } from "./serialize.js";

/** How many items one owner may have read again per minute, one by one. */
export const ITEM_REFRESHES_PER_MINUTE = 30;
/** How many whole lists one owner may have read again per minute. */
export const LIST_REFRESHES_PER_MINUTE = 3;

const itemParams = z.object({ itemId: z.uuid() });
const listParams = z.object({ listId: z.uuid() });

/** Being read already: asking again changes nothing. */
const reading = (state: string | null) => state === "pending" || state === "running";

/**
 * Reading the links again, on the owner's demand (docs/enrichment.md): the item goes back into the
 * worker's queue, with the « Lecture du lien… » state, and the worker applies the usual rules (the
 * owner's own words and photo are kept). Each owner is limited, and a whole list is spaced site by
 * site (refreshSchedule), so that no site gets a burst of requests.
 */
export const refreshRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db, now, images }) => {
  const items = createRateLimiter(ITEM_REFRESHES_PER_MINUTE);
  const lists = createRateLimiter(LIST_REFRESHES_PER_MINUTE);

  app.post("/items/:itemId/refresh", async (request) => {
    const { itemId } = parse(itemParams, request.params);
    const ownerId = userId(request);
    const item = await db.transaction(async (tx) => {
      const before = await ownedItem(tx, ownerId, itemId);
      if (!before.url) throw new HttpError(409, "no_link");
      if (reading(before.enrichment)) return before;
      if (!items.hit(ownerId, now()).allowed) throw new HttpError(429, "rate_limited");
      const row = first(
        await tx
          .update(schema.wishes)
          .set({ enrichment: "pending", enrichmentAttempts: 0, enrichmentAt: null })
          .where(eq(schema.wishes.id, itemId))
          .returning(),
      );
      await recordHistory(tx, [
        { wishId: itemId, type: "refresh_requested", actorId: ownerId, payload: {}, visibility: "owner" },
      ]);
      return row;
    });
    return ownerItem(item, await imageOf(db, images, item));
  });

  /** Every open item of the list with a link, except those being read already. */
  app.post("/lists/:listId/refresh", async (request) => {
    const { listId } = parse(listParams, request.params);
    const ownerId = userId(request);
    const [list] = await db
      .select({ id: schema.wishLists.id })
      .from(schema.wishLists)
      .where(
        and(
          eq(schema.wishLists.id, listId),
          eq(schema.wishLists.ownerId, ownerId),
          isNull(schema.wishLists.deletedAt),
        ),
      );
    if (!list) throw notFound();
    if (!lists.hit(ownerId, now()).allowed) throw new HttpError(429, "rate_limited");

    const queued = await db.transaction(async (tx) => {
      const rows = await tx
        .select({ id: schema.wishes.id, url: schema.wishes.url })
        .from(schema.wishes)
        .where(
          and(
            eq(schema.wishes.listId, listId),
            eq(schema.wishes.status, "open"),
            isNotNull(schema.wishes.url),
            or(
              sql`${schema.wishes.enrichment} IS NULL`,
              inArray(schema.wishes.enrichment, ["done", "failed"]),
            ),
          ),
        )
        .orderBy(schema.wishes.position, schema.wishes.createdAt)
        .for("update");
      const schedule = refreshSchedule(rows, now());
      for (const [id, at] of schedule) {
        await tx
          .update(schema.wishes)
          .set({ enrichment: "pending", enrichmentAttempts: 0, enrichmentAt: at })
          .where(eq(schema.wishes.id, id));
      }
      await recordHistory(
        tx,
        [...schedule.keys()].map((wishId) => ({
          wishId,
          type: "refresh_requested" as const,
          actorId: ownerId,
          payload: { list: true },
          visibility: "owner" as const,
        })),
      );
      return schedule.size;
    });
    return { queued };
  });
};
