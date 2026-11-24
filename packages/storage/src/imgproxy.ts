import { createHmac } from "node:crypto";

import type { Crop } from "@wishalia/domain";

/**
 * The paths of the thumbnails (docs/images.md). imgproxy, inside the cluster, reads the files from
 * the bucket and makes the sizes; the frontends pass its answers on under /img/. Every path is
 * signed with IMGPROXY_KEY and IMGPROXY_SALT: a browser cannot ask for another file or another
 * size, and imgproxy refuses what the API did not sign.
 */

export interface ImgproxySettings {
  /** Hex, as imgproxy reads IMGPROXY_KEY and IMGPROXY_SALT. */
  key: string;
  salt: string;
  bucket: string;
}

/** The sizes the screens use: a list row, a card, and the whole image to frame it. */
export const VARIANTS = {
  small: "rs:fill:192:192:0",
  medium: "rs:fill:480:480:0",
  large: "rs:fit:1200:1200:0",
} as const;
export type Variant = keyof typeof VARIANTS;

/** Where the frontends serve the thumbnails. */
export const IMAGE_PREFIX = "/img";

const number = (value: number) => String(Math.round(value * 10_000) / 10_000);

/** imgproxy's crop: relative values under 1; a full side is 0 (1 would mean one pixel). */
export function cropOption(crop: Crop): string {
  const side = (value: number) => (value >= 0.9999 ? "0" : number(value));
  return `c:${side(crop.width)}:${side(crop.height)}:nowe:${number(crop.x)}:${number(crop.y)}`;
}

/** imgproxy's signature: URL-safe base64 of HMAC-SHA256(key, salt + path), without padding. */
export function sign(settings: Pick<ImgproxySettings, "key" | "salt">, path: string): string {
  return createHmac("sha256", Buffer.from(settings.key, "hex"))
    .update(Buffer.from(settings.salt, "hex"))
    .update(path)
    .digest("base64url");
}

/** The signed path of one size of an image, under IMAGE_PREFIX. The frame is not applied to "large". */
export function imagePath(
  settings: ImgproxySettings,
  key: string,
  variant: Variant,
  crop: Crop | null,
): string {
  const source = Buffer.from(`s3://${settings.bucket}/${key}`).toString("base64url");
  const options = [variant !== "large" && crop ? cropOption(crop) : null, VARIANTS[variant]].filter(Boolean);
  const path = `/${options.join("/")}/${source}.webp`;
  return `${IMAGE_PREFIX}/${sign(settings, path)}${path}`;
}

/** The three sizes of an image, as the screens get them. */
export function imageSources(settings: ImgproxySettings, key: string, crop: Crop | null) {
  return {
    small: imagePath(settings, key, "small", crop),
    medium: imagePath(settings, key, "medium", crop),
    large: imagePath(settings, key, "large", crop),
  };
}
export type ImageSources = ReturnType<typeof imageSources>;

/** Whether a path a browser asked for may be passed on to imgproxy: signed shape, no trick. */
export function isImagePath(path: string): boolean {
  return path.length <= 1024 && /^\/[\w-]{43}(\/[\w:.-]+)+\.webp$/.test(path) && !path.includes("..");
}
