import { describe, expect, it } from "vitest";

import { fitWithin, shrinkPhoto } from "./photo.ts";

describe("fitWithin", () => {
  it("keeps the shape, the longest side at 2 048 px at most, never larger", () => {
    expect(fitWithin(4032, 3024)).toEqual({ width: 2048, height: 1536 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1024, height: 2048 });
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("shrinkPhoto", () => {
  it("leaves small files and GIFs as they are", async () => {
    const small = new File([new Uint8Array(10)], "a.png", { type: "image/png" });
    expect(await shrinkPhoto(small)).toBe(small);
    const gif = new File([new Uint8Array(2 * 1024 * 1024)], "a.gif", { type: "image/gif" });
    expect(await shrinkPhoto(gif)).toBe(gif);
  });

  it("leaves a big file as it is where the browser cannot draw it", async () => {
    const big = new File([new Uint8Array(2 * 1024 * 1024)], "a.jpg", { type: "image/jpeg" });
    expect(await shrinkPhoto(big)).toBe(big);
  });
});
