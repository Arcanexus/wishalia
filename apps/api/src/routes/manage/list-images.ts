import { randomUUID } from "node:crypto";

import { schema } from "@wishalia/db";
import { listImageKey, MAX_IMAGE_BYTES, MAX_IMAGE_PIXELS } from "@wishalia/domain";
import { sniffImage } from "@wishalia/storage";
import type { FastifyPluginAsync } from "fastify";

import { first, HttpError, notFound, parse, userId } from "../../http.js";
import { listPictureOf, type Images } from "../../images.js";
import type { ListDeps } from "./index.js";
import { idParams, openUrlsOf, ownedList } from "./lists.js";
import { ownerList } from "./serialize.js";

function enabled(images: Images | null): Images {
  if (!images) throw new HttpError(503, "images_off");
  return images;
}

/**
 * The image of a list (docs/list-pictures.md): the owner sends their own picture to show next to
 * its name, in place of its icon, or removes it to show the icon again. Checked as the items'
 * images are (docs/images.md): read from its bytes, JPEG, PNG, WebP, GIF, AVIF or HEIC only, never
 * SVG, 10 MB and 50 megapixels at most; imgproxy re-encodes it for every screen. The list's picture
 * says nothing about a gift: no history entry.
 */
export const listImageRoutes: FastifyPluginAsync<ListDeps> = async (app, { db, images, publicOrigin }) => {
  const answer = async (row: typeof schema.wishLists.$inferSelect) => {
    const urls = row.visibility === "public" ? await openUrlsOf(db, publicOrigin, [row.id]) : null;
    return ownerList(row, 0, urls?.get(row.id) ?? null, listPictureOf(images, row));
  };

  // The file comes as the body itself, never as multipart: what it is, the bytes say
  app.addContentTypeParser(
    /^(image\/[\w.+-]+|application\/octet-stream)$/,
    { parseAs: "buffer", bodyLimit: MAX_IMAGE_BYTES },
    (_request, body, done) => done(null, body),
  );

  /** Sends the list's image; it replaces the previous one, whose file goes. */
  app.put("/lists/:listId/image", { bodyLimit: MAX_IMAGE_BYTES }, async (request) => {
    const { listId } = parse(idParams, request.params);
    const settings = enabled(images);
    const mine = ownedList(listId, userId(request));
    const [list] = await db.select({ id: schema.wishLists.id }).from(schema.wishLists).where(mine);
    if (!list) throw notFound();
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

    const key = listImageKey(listId, randomUUID());
    await settings.storage.put(key, body, sniffed.type);
    let replaced: string | null = null;
    let row;
    try {
      row = await db.transaction(async (tx) => {
        const [before] = await tx
          .select({ imageKey: schema.wishLists.imageKey })
          .from(schema.wishLists)
          .where(mine)
          .for("update");
        if (!before) throw notFound();
        replaced = before.imageKey;
        return first(await tx.update(schema.wishLists).set({ imageKey: key }).where(mine).returning());
      });
    } catch (error) {
      await settings.storage.delete(key).catch(() => undefined);
      throw error;
    }
    if (replaced) await settings.storage.delete(replaced).catch(() => undefined);
    return answer(row);
  });

  /** Removes the list's image, file included: its icon shows again. */
  app.delete("/lists/:listId/image", async (request) => {
    const { listId } = parse(idParams, request.params);
    const settings = enabled(images);
    const mine = ownedList(listId, userId(request));
    let removed: string | null = null;
    const row = await db.transaction(async (tx) => {
      const [before] = await tx
        .select({ imageKey: schema.wishLists.imageKey })
        .from(schema.wishLists)
        .where(mine)
        .for("update");
      if (!before) throw notFound();
      if (!before.imageKey) throw new HttpError(404, "no_image");
      removed = before.imageKey;
      return first(await tx.update(schema.wishLists).set({ imageKey: null }).where(mine).returning());
    });
    if (removed) await settings.storage.delete(removed).catch(() => undefined);
    return answer(row);
  });
};
