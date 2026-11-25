import { describe, expect, it } from "vitest";

import { galleryOf, keyTarget, step, swipeDirection, SWIPE_MIN } from "./gallery.ts";

describe("the image viewer", () => {
  it("opens the image shown first, then the others, each once", () => {
    expect(galleryOf(null)).toEqual([]);
    expect(galleryOf(undefined)).toEqual([]);
    expect(galleryOf({ large: "/img/a" })).toEqual(["/img/a"]);
    expect(galleryOf({ large: "/img/a", gallery: ["/img/b", "/img/a", "/img/c", "/img/b"] })).toEqual([
      "/img/a",
      "/img/b",
      "/img/c",
    ]);
  });

  it("goes round at both ends", () => {
    expect(step(0, -1, 3)).toBe(2);
    expect(step(2, 1, 3)).toBe(0);
    expect(step(1, 1, 3)).toBe(2);
    expect(step(0, 1, 0)).toBe(0);
  });

  it("follows the arrows, Home and End, and nothing else", () => {
    expect(keyTarget("ArrowRight", 0, 3)).toBe(1);
    expect(keyTarget("ArrowLeft", 0, 3)).toBe(2);
    expect(keyTarget("Home", 2, 3)).toBe(0);
    expect(keyTarget("End", 0, 3)).toBe(2);
    expect(keyTarget("Enter", 0, 3)).toBeNull();
    // One image: the keys are left to the page
    expect(keyTarget("ArrowRight", 0, 1)).toBeNull();
  });

  it("tells a swipe from a tap or a scroll", () => {
    expect(swipeDirection(-SWIPE_MIN, 0)).toBe(1);
    expect(swipeDirection(SWIPE_MIN + 10, 5)).toBe(-1);
    expect(swipeDirection(SWIPE_MIN - 1, 0)).toBe(0);
    expect(swipeDirection(60, 50)).toBe(0);
  });
});
