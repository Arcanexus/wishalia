import { type Database, schema } from "@wishalia/db";
import type { Crop } from "@wishalia/domain";
import { imageSources, type ImageSources, type ImgproxySettings, type Storage } from "@wishalia/storage";
import { inArray } from "drizzle-orm";

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

/**
 * The signed thumbnail paths of the items, by item id, in one query. An item without an image,
 * or a server without images, gets null.
 */
export async function imagesOf(
  db: Database | Tx,
  images: Images | null,
  rows: readonly WithImage[],
): Promise<Map<string, ImageSources | null>> {
  const result = new Map<string, ImageSources | null>();
  const ids = [...new Set(rows.map((row) => row.imageId).filter((id): id is string => id !== null))];
  if (!images || ids.length === 0) return result;
  const found = await db
    .select({ id: schema.wishImages.id, key: schema.wishImages.key })
    .from(schema.wishImages)
    .where(inArray(schema.wishImages.id, ids));
  const keys = new Map(found.map((image) => [image.id, image.key]));
  for (const row of rows) {
    const key = row.imageId ? keys.get(row.imageId) : undefined;
    result.set(row.id, key ? imageSources(images.imgproxy, key, row.imageCrop) : null);
  }
  return result;
}

/** The same, for one item. */
export async function imageOf(db: Database | Tx, images: Images | null, row: WithImage) {
  return (await imagesOf(db, images, [row])).get(row.id) ?? null;
}
