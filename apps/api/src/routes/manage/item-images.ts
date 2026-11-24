import { randomUUID } from "node:crypto";

import { schema } from "@wishalia/db";
import { MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS, normalizeCrop } from "@wishalia/domain";
import { imageSources, sniffImage } from "@wishalia/storage";
import { and, asc, desc, eq, inArray, ne } from "drizzle-orm";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";

import { recordHistory } from "../../history.js";
import { first, HttpError, parse, userId } from "../../http.js";
import { imageOf, type Images } from "../../images.js";
import type { ManageDeps } from "./index.js";
import { ownedItem } from "./items.js";
import { ownerItem } from "./serialize.js";

const itemParams = z.object({ itemId: z.uuid() });

const fraction = z.number().min(-1).max(2);
export const imagePatch = z
  .object({
    /** One of the item's images, or null to show none. */
    imageId: z.uuid().nullable(),
    /** The frame, as fractions of the image; null shows it whole. */
    crop: z.object({ x: fraction, y: fraction, width: fraction, height: fraction }).strict().nullable(),
  })
  .partial()
  .strict()
  .refine((patch) => patch.imageId !== undefined || patch.crop !== undefined, { message: "empty" });

function enabled(images: Images | null): Images {
  if (!images) throw new HttpError(503, "images_off");
  return images;
}

/**
 * The images of an item (docs/images.md): the proposals of its page, the one the owner sends, the
 * one it shows and its frame. Every change writes an "image_changed" history entry.
 */
export const itemImageRoutes: FastifyPluginAsync<ManageDeps> = async (app, { db, now, images }) => {
  // The file comes as the body itself, never as multipart: what it is, the bytes say
  app.addContentTypeParser(
    /^(image\/[\w.+-]+|application\/octet-stream)$/,
    { parseAs: "buffer", bodyLimit: MAX_IMAGE_BYTES },
    (_request, body, done) => done(null, body),
  );

  /** The images to choose from, the owner's own first, then the page's in its order. */
  app.get("/items/:itemId/images", async (request) => {
    const { itemId } = parse(itemParams, request.params);
    const item = await ownedItem(db, userId(request), itemId);
    const settings = images;
    if (!settings) return { imageId: null, crop: null, images: [] };
    const rows = await db
      .select()
      .from(schema.wishImages)
      .where(eq(schema.wishImages.wishId, itemId))
      .orderBy(
        desc(schema.wishImages.source),
        asc(schema.wishImages.position),
        asc(schema.wishImages.createdAt),
      );
    return {
      imageId: item.imageId,
      crop: item.imageCrop,
      images: rows.map((row) => ({
        id: row.id,
        source: row.source,
        width: row.width,
        height: row.height,
        sources: imageSources(settings.imgproxy, row.key, null),
      })),
    };
  });

  /**
   * The owner sends an image (a photo, a picture saved from a site). Read from its bytes: JPEG,
   * PNG, WebP, GIF, AVIF or HEIC only, never SVG; 10 MB at most. It replaces their previous one.
   */
  app.put("/items/:itemId/image", { bodyLimit: MAX_IMAGE_BYTES }, async (request) => {
    const { itemId } = parse(itemParams, request.params);
    const settings = enabled(images);
    const ownerId = userId(request);
    await ownedItem(db, ownerId, itemId);
    const body = request.body;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(415, "not_an_image");
    const sniffed = sniffImage(body);
    if (!sniffed) throw new HttpError(415, "not_an_image");
    if (
      sniffed.width !== null &&
      sniffed.height !== null &&
      sniffed.width * sniffed.height > MAX_IMAGE_PIXELS
    ) {
      throw new HttpError(422, "image_too_large");
    }

    const key = `wishes/${itemId}/${randomUUID()}`;
    await settings.storage.put(key, body, sniffed.type);
    const replaced: string[] = [];
    let updated;
    try {
      updated = await db.transaction(async (tx) => {
        await ownedItem(tx, ownerId, itemId);
        const image = first(
          await tx
            .insert(schema.wishImages)
            .values({
              wishId: itemId,
              source: "upload",
              key,
              contentType: sniffed.type,
              bytes: body.length,
              width: sniffed.width,
              height: sniffed.height,
            })
            .returning(),
        );
        const row = first(
          await tx
            .update(schema.wishes)
            .set({ imageId: image.id, imageCrop: null, updatedAt: now() })
            .where(eq(schema.wishes.id, itemId))
            .returning(),
        );
        // One image of the owner per item: the previous one goes
        const previous = await tx
          .select({ id: schema.wishImages.id, key: schema.wishImages.key })
          .from(schema.wishImages)
          .where(
            and(
              eq(schema.wishImages.wishId, itemId),
              eq(schema.wishImages.source, "upload"),
              ne(schema.wishImages.id, image.id),
            ),
          );
        if (previous.length > 0) {
          await tx.delete(schema.wishImages).where(
            inArray(
              schema.wishImages.id,
              previous.map((entry) => entry.id),
            ),
          );
          replaced.push(...previous.map((entry) => entry.key));
        }
        await recordHistory(tx, [
          {
            wishId: itemId,
            type: "image_changed",
            actorId: ownerId,
            payload: { source: "upload" },
            visibility: "owner",
          },
        ]);
        return row;
      });
    } catch (error) {
      await settings.storage.delete(key).catch(() => undefined);
      throw error;
    }
    await Promise.allSettled(replaced.map((old) => settings.storage.delete(old)));
    return ownerItem(updated, await imageOf(db, images, updated));
  });

  /** Chooses the image shown (or none), and its frame. */
  app.patch("/items/:itemId/image", async (request) => {
    const { itemId } = parse(itemParams, request.params);
    const patch = parse(imagePatch, request.body);
    enabled(images);
    const ownerId = userId(request);
    const updated = await db.transaction(async (tx) => {
      const before = await ownedItem(tx, ownerId, itemId);
      if (patch.imageId) {
        const [image] = await tx
          .select({ id: schema.wishImages.id })
          .from(schema.wishImages)
          .where(and(eq(schema.wishImages.id, patch.imageId), eq(schema.wishImages.wishId, itemId)));
        if (!image) {
          throw new HttpError(400, "invalid_request", {
            issues: [{ path: "imageId", message: "not an image of this item" }],
          });
        }
      }
      const imageId = patch.imageId !== undefined ? patch.imageId : before.imageId;
      // Another image starts whole, unless a frame comes with it
      const crop =
        patch.crop !== undefined
          ? patch.crop && normalizeCrop(patch.crop)
          : imageId === before.imageId
            ? before.imageCrop
            : null;
      if (crop && !imageId) throw new HttpError(409, "no_image");
      const changes: Record<string, unknown> = {};
      if (imageId !== before.imageId) changes.imageId = { from: before.imageId, to: imageId };
      if (JSON.stringify(crop) !== JSON.stringify(before.imageCrop))
        changes.crop = { from: before.imageCrop, to: crop };
      if (Object.keys(changes).length === 0) return before;
      const row = first(
        await tx
          .update(schema.wishes)
          .set({ imageId, imageCrop: crop, updatedAt: now() })
          .where(eq(schema.wishes.id, itemId))
          .returning(),
      );
      await recordHistory(tx, [
        {
          wishId: itemId,
          type: "image_changed",
          actorId: ownerId,
          payload: { changes },
          visibility: "owner",
        },
      ]);
      return row;
    });
    return ownerItem(updated, await imageOf(db, images, updated));
  });
};
