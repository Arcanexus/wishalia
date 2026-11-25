import { schema } from "@wishalia/db";
import {
  FILE_IMPORTERS,
  ImportError,
  importWishlistrPage,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ITEMS,
  MAX_IMPORT_LIST_NAME_LENGTH,
  MAX_IMPORT_NOTES_LENGTH,
  MAX_TITLE_LENGTH,
  normalizeWish,
  type ImportedWish,
  type ImportPreview,
  wishlistrAddress,
} from "@wishalia/domain";
import { and, eq, inArray, sql } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { recordHistory } from "../../history.js";
import { first, HttpError, notFound, parse, userId } from "../../http.js";
import { createRateLimiter } from "../../rate-limit.js";
import { type FetchPage, RemoteError } from "../../remote.js";
import type { ManageDeps } from "./index.js";

/** What reading a source needs besides /manage: the reader of a remote list page. */
export interface ImportDeps extends ManageDeps {
  fetchPage: FetchPage;
}

/** Remote pages read per person and per minute: an import is a rare, human action. */
export const REMOTE_IMPORTS_PER_MINUTE = 10;

const previewInput = z.discriminatedUnion("source", [
  z.object({ source: z.literal("wishlistr"), address: z.string().max(500) }).strict(),
  z
    .object({
      source: z.enum(["csv", "json", "text"]),
      // In characters: the importers check the size in bytes
      content: z.string().max(MAX_IMPORT_BYTES),
    })
    .strict(),
]);

const importedWish = z
  .object({
    title: z.string().max(MAX_TITLE_LENGTH),
    url: z.string().max(2000).nullable(),
    notes: z.string().max(MAX_IMPORT_NOTES_LENGTH).nullable(),
    priceCents: z.number().int().min(0).max(100_000_000).nullable(),
    quantity: z.number().int().min(2).max(1000).nullable(),
  })
  .strict();

const commitInput = z
  .object({
    source: z.enum(["wishlistr", "csv", "json", "text"]),
    /** An existing list of the owner, or the name of a new one. */
    listId: z.uuid().optional(),
    listName: z.string().trim().min(1).max(MAX_IMPORT_LIST_NAME_LENGTH).optional(),
    items: z.array(importedWish).min(1).max(MAX_IMPORT_ITEMS),
  })
  .strict()
  .refine((input) => (input.listId === undefined) !== (input.listName === undefined), {
    message: "listId or listName, one of them",
  });

export const importRoutes: FastifyPluginAsync<ImportDeps> = async (app, { db, now, fetchPage }) => {
  const limiter = createRateLimiter(REMOTE_IMPORTS_PER_MINUTE);

  /**
   * Reads a source and gives what it would add, without adding anything: the owner picks the
   * wishes and the list, then confirms (POST /imports).
   */
  app.post("/imports/preview", { bodyLimit: 4 * MAX_IMPORT_BYTES }, async (request) => {
    const body = parse(previewInput, request.body);
    const ownerId = userId(request);
    try {
      if (body.source === "wishlistr") {
        const address = wishlistrAddress(body.address);
        if (!limiter.hit(ownerId, now()).allowed) throw new HttpError(429, "rate_limited");
        const preview = importWishlistrPage(await fetchPage(address));
        return { ...preview, address } satisfies ImportPreview & { address: string };
      }
      return FILE_IMPORTERS[body.source](body.content);
    } catch (error) {
      if (error instanceof ImportError) throw new HttpError(422, error.code);
      if (error instanceof RemoteError) {
        throw new HttpError(error.code === "remote_not_found" ? 404 : 502, error.code);
      }
      throw error;
    }
  });

  /**
   * Adds the wishes the owner kept, in one transaction, after their current ones, in the order of
   * the source. Each one is normalised again (the client is never trusted) and writes its
   * "created" history entry, marked as an import. A link already in an open item of the list is
   * not added twice. The worker completes the items with a link (docs/enrichment.md).
   */
  app.post("/imports", { bodyLimit: 4 * MAX_IMPORT_BYTES }, async (request, reply) => {
    const body = parse(commitInput, request.body);
    const ownerId = userId(request);
    const wishes = body.items.map(normalizeWish).filter((wish): wish is ImportedWish => wish !== null);

    const result = await db.transaction(async (tx) => {
      let listId: string;
      if (body.listId) {
        const [list] = await tx
          .select({ id: schema.wishLists.id })
          .from(schema.wishLists)
          .where(
            and(
              eq(schema.wishLists.id, body.listId),
              eq(schema.wishLists.ownerId, ownerId),
              sql`${schema.wishLists.archivedAt} IS NULL`,
            ),
          );
        if (!list) throw notFound();
        listId = list.id;
      } else {
        const created = first(
          await tx
            .insert(schema.wishLists)
            .values({
              ownerId,
              name: body.listName ?? "",
              position: sql`(SELECT coalesce(max(${schema.wishLists.position}) + 1, 0) FROM ${schema.wishLists} WHERE ${schema.wishLists.ownerId} = ${ownerId})`,
            })
            .returning(),
        );
        listId = created.id;
      }

      const links = [...new Set(wishes.map((wish) => wish.url).filter((url): url is string => url !== null))];
      const known = new Set(
        links.length
          ? (
              await tx
                .select({ url: schema.wishes.url })
                .from(schema.wishes)
                .where(
                  and(
                    eq(schema.wishes.listId, listId),
                    eq(schema.wishes.status, "open"),
                    inArray(schema.wishes.url, links),
                  ),
                )
            ).map((row) => row.url)
          : [],
      );
      const kept: ImportedWish[] = [];
      let duplicates = 0;
      for (const wish of wishes) {
        if (wish.url && known.has(wish.url)) {
          duplicates += 1;
          continue;
        }
        if (wish.url) known.add(wish.url);
        kept.push(wish);
      }

      const [last] = await tx
        .select({ position: sql<number>`coalesce(max(${schema.wishes.position}), -1)` })
        .from(schema.wishes)
        .where(eq(schema.wishes.listId, listId));
      const start = Number(last?.position ?? -1) + 1;

      const at = now();
      const rows = kept.length
        ? await tx
            .insert(schema.wishes)
            .values(
              kept.map((wish, index) => ({
                listId,
                title: wish.title,
                url: wish.url,
                notes: wish.notes,
                priceCents: wish.priceCents,
                kind: wish.quantity ? ("quantity" as const) : ("unique" as const),
                quantity: wish.quantity,
                enrichment: wish.url ? ("pending" as const) : null,
                position: start + index,
                createdAt: at,
                updatedAt: at,
              })),
            )
            .returning({ id: schema.wishes.id, title: schema.wishes.title, url: schema.wishes.url })
        : [];
      await recordHistory(
        tx,
        rows.map((row) => ({
          wishId: row.id,
          type: "created" as const,
          actorId: ownerId,
          payload: { title: row.title, url: row.url, importedFrom: body.source },
          visibility: "owner" as const,
        })),
      );
      return { listId, added: rows.length, duplicates, skipped: body.items.length - wishes.length };
    });

    return reply.status(201).send(result);
  });
};
