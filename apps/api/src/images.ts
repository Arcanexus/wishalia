import { type Database, schema } from "@wishalia/db";
import type { Crop } from "@wishalia/domain";
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
