import { type Database, schema } from "@wishalia/db";
import { type Crop, isListIcon, type ListIcon } from "@wishalia/domain";
import {
  imagePath,
  imageSources,
  type ImageSources,
  type ImgproxySettings,
  type Storage,
} from "@wishalia/storage";
import { asc, inArray } from "drizzle-orm";

import type { Tx } from "./history.js";

/** The image settings (docs/images.md): null when no bucket is configured. */
export interface Images {
  storage: Storage;
  imgproxy: ImgproxySettings;
}

interface WithImage {
  id: string;
  imageId: string | null;
  imageCrop: Crop | null;
}

/** The most images of an item shown together, the one shown included (docs/images.md). */
export const GALLERY_MAX = 8;

/**
 * The image an item shows, in its three sizes, and its other images, whole (`large`), for the
 * screens that open them big. The others only come with an image shown: an owner who chose « Ne
 * plus afficher d'image » shows none at all.
 */
export type ItemImage = ImageSources & { gallery: string[] };

/**
 * The signed thumbnail paths of the items, by item id, in one query. An item without an image,
 * or a server without images, gets null.
 */
export async function imagesOf(
  db: Database | Tx,
  images: Images | null,
  rows: readonly WithImage[],
): Promise<Map<string, ItemImage | null>> {
  const result = new Map<string, ItemImage | null>();
  const shown = rows.filter((row) => row.imageId !== null);
  if (!images || shown.length === 0) return result;
  const found = await db
    .select({ id: schema.wishImages.id, wishId: schema.wishImages.wishId, key: schema.wishImages.key })
    .from(schema.wishImages)
    .where(inArray(schema.wishImages.wishId, [...new Set(shown.map((row) => row.id))]))
    .orderBy(asc(schema.wishImages.position), asc(schema.wishImages.createdAt));
  const byWish = new Map<string, typeof found>();
  for (const image of found) byWish.set(image.wishId, [...(byWish.get(image.wishId) ?? []), image]);
  for (const row of rows) {
    const own = byWish.get(row.id) ?? [];
    const image = own.find((candidate) => candidate.id === row.imageId);
    if (!image) {
      result.set(row.id, null);
      continue;
    }
    const gallery = own
      .filter((other) => other !== image)
      .slice(0, GALLERY_MAX - 1)
      .map((other) => imagePath(images.imgproxy, other.key, "large", null));
    result.set(row.id, { ...imageSources(images.imgproxy, image.key, row.imageCrop), gallery });
  }
  return result;
}

/** The same, for one item. */
export async function imageOf(db: Database | Tx, images: Images | null, row: WithImage) {
  return (await imagesOf(db, images, [row])).get(row.id) ?? null;
}

/**
 * The picture of a list, as every screen gets it (docs/list-pictures.md): the icon the owner chose
 * (null: the default one) and, when they sent one, the signed paths of their image, which wins.
 * A server without images shows the icon only.
 */
export interface ListPictureFields {
  icon: ListIcon | null;
  image: ImageSources | null;
}

export function listPictureOf(
  images: Images | null,
  row: { icon: string | null; imageKey: string | null },
): ListPictureFields {
  return {
    icon: isListIcon(row.icon) ? row.icon : null,
    image: images && row.imageKey ? imageSources(images.imgproxy, row.imageKey, null) : null,
  };
}

/**
 * Removes deleted files in the background, once the answer is on its way (docs/archive-delete.md):
 * a deletion is done for the person as soon as its transaction is, the bucket or the volume can
 * take its time. Best effort: a file left behind (the server stopped, the bucket did not answer)
 * names no row any more, so the worker's periodic cleanup removes it (docs/images.md). Resolves
 * once every file was tried, for the tests; never rejects.
 */
export function removeInBackground(
  images: Images | null,
  keys: readonly string[],
  log?: { warn: (details: object, message: string) => void },
): Promise<void> {
  if (!images || keys.length === 0) return Promise.resolve();
  return new Promise<void>((done) => {
    setImmediate(() => {
      void Promise.allSettled(keys.map((key) => images.storage.delete(key))).then((results) => {
        const failed = results.filter((result) => result.status === "rejected").length;
        if (failed > 0) log?.warn({ failed }, "files left for the periodic cleanup");
        done();
      });
    });
  });
}
