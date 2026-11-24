import { describe, expect, it } from "vitest";

import { isProposable, MAX_IMAGE_BYTES, normalizeCrop, pageImageLinks } from "./images.js";

describe("normalizeCrop", () => {
  it("keeps a frame inside the image, rounded", () => {
    expect(normalizeCrop({ x: 0.123456, y: 0.2, width: 0.5, height: 0.5 })).toEqual({
      x: 0.1235,
      y: 0.2,
      width: 0.5,
      height: 0.5,
    });
  });

  it("moves a frame that goes past an edge back inside", () => {
    expect(normalizeCrop({ x: 0.8, y: -0.2, width: 0.5, height: 0.4 })).toEqual({
      x: 0.5,
      y: 0,
      width: 0.5,
      height: 0.4,
    });
  });

  it("makes a tiny frame larger, and a huge one fit", () => {
    expect(normalizeCrop({ x: 0, y: 0, width: 0.001, height: 3 })).toEqual({
      x: 0,
      y: 0,
      width: 0.05,
      height: 1,
    });
  });

  it("gives null for the whole image or for something that is not a number", () => {
    expect(normalizeCrop({ x: 0, y: 0, width: 1, height: 1 })).toBeNull();
    expect(normalizeCrop({ x: Number.NaN, y: 0, width: 0.5, height: 0.5 })).toBeNull();
    expect(normalizeCrop({ x: 0, y: 0, width: Infinity, height: 0.5 })).toBeNull();
  });
});

describe("isProposable", () => {
  it("takes an image large enough, or of unknown size", () => {
    expect(isProposable({ width: 800, height: 600, bytes: 50_000 })).toBe(true);
    expect(isProposable({ width: null, height: null, bytes: 50_000 })).toBe(true);
  });

  it("leaves out icons, pixels, empty, too heavy or too many pixels", () => {
    expect(isProposable({ width: 1, height: 1, bytes: 43 })).toBe(false);
    expect(isProposable({ width: 800, height: 64, bytes: 5_000 })).toBe(false);
    expect(isProposable({ width: 800, height: 800, bytes: 0 })).toBe(false);
    expect(isProposable({ width: 800, height: 800, bytes: MAX_IMAGE_BYTES + 1 })).toBe(false);
    expect(isProposable({ width: 20_000, height: 20_000, bytes: 5_000_000 })).toBe(false);
  });
});

describe("pageImageLinks", () => {
  it("reads relative links against the page, drops duplicates and fragments, keeps the order", () => {
    expect(
      pageImageLinks(
        ["/img/a.jpg", "https://cdn.example.com/b.png#zoom", "https://shop.example.com/img/a.jpg", "c.webp"],
        "https://shop.example.com/p/lampe",
      ),
    ).toEqual([
      "https://shop.example.com/img/a.jpg",
      "https://cdn.example.com/b.png",
      "https://shop.example.com/p/c.webp",
    ]);
  });

  it("leaves out data:, javascript: and broken links, and stops at the limit", () => {
    expect(
      pageImageLinks(
        [
          "data:image/png;base64,AAAA",
          "javascript:alert(1)",
          "http://[bad",
          "/1.jpg",
          "/2.jpg",
          "/3.jpg",
          "/4.jpg",
          "/5.jpg",
        ],
        "https://shop.example.com/",
      ),
    ).toEqual([
      "https://shop.example.com/1.jpg",
      "https://shop.example.com/2.jpg",
      "https://shop.example.com/3.jpg",
      "https://shop.example.com/4.jpg",
    ]);
  });
});
