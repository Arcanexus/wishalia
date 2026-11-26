/**
 * The rules of the image viewer (Gallery.svelte, docs/images.md), as pure functions: which images
 * an item opens, where the arrows and a swipe lead.
 */

/** What an item gives: its image shown (`large` is whole) and its other images, whole. */
export interface GallerySources {
  large: string;
  gallery?: readonly string[] | undefined;
}

/** The images to open big: the one shown first, then the others, each once. */
export function galleryOf(image: GallerySources | null | undefined): string[] {
  if (!image) return [];
  return [...new Set([image.large, ...(image.gallery ?? [])])];
}

/** One step from `index`, going round at both ends. */
export function step(index: number, delta: number, length: number): number {
  if (length <= 0) return 0;
  return (((index + delta) % length) + length) % length;
}

/** Where a key leads in a viewer of `length` images, or null for a key it does not use. */
export function keyTarget(key: string, index: number, length: number): number | null {
  if (length <= 1) return null;
  switch (key) {
    case "ArrowLeft":
      return step(index, -1, length);
    case "ArrowRight":
      return step(index, 1, length);
    case "Home":
      return 0;
    case "End":
      return length - 1;
    default:
      return null;
  }
}

/** Below this many CSS pixels, a finger that moved was a tap, not a swipe. */
export const SWIPE_MIN = 40;

/**
 * Which way a swipe goes, from how far the finger moved: -1 back (towards the right), 1 on
 * (towards the left), 0 for a tap or a mostly vertical move (the page scrolls, nothing changes).
 */
export function swipeDirection(dx: number, dy: number): -1 | 0 | 1 {
  if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return 0;
  return dx < 0 ? 1 : -1;
}
