/**
 * The images of an item (spec §6, docs/images.md): what may be stored, how many proposals the
 * page gives, and the frame the owner chooses. Pure: no file, no network.
 */

/** The formats an image may have, found from its first bytes (never from a name or a header). */
export const IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/avif",
  "image/heic",
] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];

/** The largest image sent by the owner or taken from a page. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
/** How many images of the page are proposed (spec §5.3: 3 or 4). */
export const MAX_PAGE_IMAGES = 4;
/** Smaller than this on a side, an image of a page is an icon or a tracking pixel. */
export const MIN_PAGE_IMAGE_SIDE = 120;
/** The largest image, in pixels, that imgproxy is asked to read (a decompression bomb past it). */
export const MAX_IMAGE_PIXELS = 50_000_000;

/** A frame in an image, as fractions of its width and height (0 to 1). */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The smallest frame, as a fraction of a side: under it, a few pixels only. */
export const MIN_CROP = 0.05;

const round = (value: number) => Math.round(value * 10_000) / 10_000;

/**
 * A frame the owner sent, made safe: inside the image, not too small, rounded. Null when it is not
 * a frame at all, or when it covers the whole image (nothing to crop).
 */
export function normalizeCrop(crop: Crop): Crop | null {
  const values = [crop.x, crop.y, crop.width, crop.height];
  if (!values.every((value) => typeof value === "number" && Number.isFinite(value))) return null;
  const width = Math.min(1, Math.max(MIN_CROP, crop.width));
  const height = Math.min(1, Math.max(MIN_CROP, crop.height));
  const x = Math.min(1 - width, Math.max(0, crop.x));
  const y = Math.min(1 - height, Math.max(0, crop.y));
  const result = { x: round(x), y: round(y), width: round(width), height: round(height) };
  if (result.width >= 0.999 && result.height >= 0.999) return null;
  return result;
}

/** Whether an image of a page is worth proposing: large enough on both sides, if known. */
export function isProposable(image: { width: number | null; height: number | null; bytes: number }): boolean {
  if (image.bytes <= 0 || image.bytes > MAX_IMAGE_BYTES) return false;
  if (image.width === null || image.height === null) return true;
  if (image.width * image.height > MAX_IMAGE_PIXELS) return false;
  return image.width >= MIN_PAGE_IMAGE_SIDE && image.height >= MIN_PAGE_IMAGE_SIDE;
}

/**
 * The links of the images a page proposes, in its order, without duplicates and only http(s),
 * at most MAX_PAGE_IMAGES. Relative links are read against the page's address.
 */
export function pageImageLinks(
  candidates: readonly string[],
  pageUrl: string,
  limit = MAX_PAGE_IMAGES,
): string[] {
  const links: string[] = [];
  for (const candidate of candidates) {
    let url: URL;
    try {
      url = new URL(candidate.trim(), pageUrl);
    } catch {
      continue;
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") continue;
    url.hash = "";
    if (!links.includes(url.href)) links.push(url.href);
    if (links.length >= limit) break;
  }
  return links;
}
