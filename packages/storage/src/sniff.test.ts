import { describe, expect, it } from "vitest";

import { sniffImage } from "./sniff.js";

const bytes = (...parts: (number[] | string)[]) =>
  Uint8Array.from(
    parts.flatMap((part) => (typeof part === "string" ? [...part].map((c) => c.charCodeAt(0)) : part)),
  );
const be32 = (n: number) => [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255];
const le16 = (n: number) => [n & 255, (n >>> 8) & 255];
const le24 = (n: number) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255];

describe("sniffImage", () => {
  it("reads a JPEG and its size from the start of frame, past the other segments", () => {
    const jpeg = bytes(
      [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10],
      "JFIF\0",
      [1, 1, 0, 0, 1, 0, 1, 0, 0],
      [0xff, 0xff], // padding
      [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x58, 0x03, 0x20, 0x03],
      new Array(12).fill(0),
    );
    expect(sniffImage(jpeg)).toEqual({ type: "image/jpeg", width: 800, height: 600 });
  });

  it("gives a JPEG without a size when its segments are broken", () => {
    expect(
      sniffImage(bytes([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0, 0, 0x12, 0x34], new Array(10).fill(0))),
    ).toEqual({
      type: "image/jpeg",
      width: null,
      height: null,
    });
    expect(
      sniffImage(bytes([0xff, 0xd8, 0xff, 0xd8, 0xff, 0xd0, 0xff, 0x01], new Array(6).fill(0))),
    ).toMatchObject({
      type: "image/jpeg",
      width: null,
    });
  });

  it("reads a PNG, a GIF", () => {
    expect(
      sniffImage(bytes("\x89PNG\r\n\x1a\n", be32(13), "IHDR", be32(640), be32(480), [8, 6, 0, 0, 0])),
    ).toEqual({
      type: "image/png",
      width: 640,
      height: 480,
    });
    expect(sniffImage(bytes("\x89PNG\r\n\x1a\n", be32(13), "XXXX", be32(640), be32(480)))).toMatchObject({
      width: null,
    });
    expect(sniffImage(bytes("GIF89a", le16(300), le16(200), [0, 0, 0, 0]))).toEqual({
      type: "image/gif",
      width: 300,
      height: 200,
    });
  });

  it("reads the three kinds of WebP", () => {
    const riff = (chunk: string, body: number[]) => bytes("RIFF", [0, 0, 0, 0], "WEBP", chunk, body);
    expect(sniffImage(riff("VP8 ", [...new Array(10).fill(0), ...le16(1024), ...le16(768)]))).toEqual({
      type: "image/webp",
      width: 1024,
      height: 768,
    });
    // VP8L: 14 bits each, minus one: 399 x 299
    const w = 399;
    const h = 299;
    const bits = w | (h << 14);
    expect(
      sniffImage(
        riff("VP8L", [
          0,
          0,
          0,
          0,
          0x2f,
          bits & 255,
          (bits >>> 8) & 255,
          (bits >>> 16) & 255,
          (bits >>> 24) & 255,
        ]),
      ),
    ).toEqual({
      type: "image/webp",
      width: 400,
      height: 300,
    });
    expect(sniffImage(riff("VP8X", [0, 0, 0, 0, 0, 0, 0, 0, ...le24(1999), ...le24(999)]))).toEqual({
      type: "image/webp",
      width: 2000,
      height: 1000,
    });
    expect(sniffImage(riff("ABCD", new Array(20).fill(0)))).toMatchObject({
      type: "image/webp",
      width: null,
    });
  });

  it("reads AVIF and HEIC from their brands, and their size from ispe", () => {
    const iso = (major: string, compatible: string[]) =>
      bytes(
        be32(16 + compatible.length * 4),
        "ftyp",
        major,
        be32(0),
        ...compatible,
        be32(20),
        "ispe",
        be32(0),
        be32(1200),
        be32(900),
      );
    expect(sniffImage(iso("avif", ["mif1"]))).toEqual({ type: "image/avif", width: 1200, height: 900 });
    expect(sniffImage(iso("mif1", ["heic"]))).toEqual({ type: "image/heic", width: 1200, height: 900 });
    expect(sniffImage(iso("mp41", ["isom"]))).toBeNull();
    expect(sniffImage(bytes(be32(16), "ftyp", "avif", be32(0), new Array(8).fill(0)))).toMatchObject({
      width: null,
    });
  });

  it("refuses SVG, HTML, short or unknown files", () => {
    expect(sniffImage(bytes('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>'))).toBeNull();
    expect(sniffImage(bytes("<!doctype html><html>"))).toBeNull();
    expect(sniffImage(bytes([0xff, 0xd8]))).toBeNull();
  });
});
