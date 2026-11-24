import type { ImageType } from "@wishalia/domain";

/**
 * What an image file really is, read from its first bytes: never from its name, its
 * Content-Type or what the browser says. SVG is never an image here (it can carry scripts).
 */
export interface Sniffed {
  type: ImageType;
  /** Null when the file does not say it in its first bytes. */
  width: number | null;
  height: number | null;
}

const ascii = (bytes: Uint8Array, start: number, length: number) =>
  String.fromCharCode(...bytes.subarray(start, start + length));

const u16be = (b: Uint8Array, i: number) => ((b[i] ?? 0) << 8) | (b[i + 1] ?? 0);
const u16le = (b: Uint8Array, i: number) => (b[i] ?? 0) | ((b[i + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, i: number) => u16le(b, i) | ((b[i + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, i: number) => ((u16be(b, i) << 16) >>> 0) + u16be(b, i + 2);

const size = (width: number, height: number) =>
  width > 0 && height > 0 ? { width, height } : { width: null, height: null };

function jpegSize(b: Uint8Array) {
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) return size(0, 0);
    const marker = b[i + 1] ?? 0;
    // Padding bytes, and the markers without a length
    if (marker === 0xff) {
      i += 1;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    // The start of the frame (SOF0 to SOF15, but DHT, JPG and DAC) holds the size
    if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      return size(u16be(b, i + 7), u16be(b, i + 5));
    }
    i += 2 + u16be(b, i + 2);
  }
  return size(0, 0);
}

function webpSize(b: Uint8Array) {
  const chunk = ascii(b, 12, 4);
  if (chunk === "VP8 ") return size(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  if (chunk === "VP8L") {
    const [b0 = 0, b1 = 0, b2 = 0, b3 = 0] = b.subarray(21, 25);
    return size(1 + (((b1 & 0x3f) << 8) | b0), 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6)));
  }
  if (chunk === "VP8X") return size(1 + u24le(b, 24), 1 + u24le(b, 27));
  return size(0, 0);
}

/** AVIF and HEIC (ISO BMFF): the first "ispe" box holds the size. */
function ispeSize(b: Uint8Array) {
  const limit = Math.min(b.length - 16, 256 * 1024);
  for (let i = 0; i <= limit; i += 1) {
    if (b[i] === 0x69 && ascii(b, i, 4) === "ispe") return size(u32be(b, i + 8), u32be(b, i + 12));
  }
  return size(0, 0);
}

const AVIF_BRANDS = new Set(["avif", "avis"]);
const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx"]);

function isoBrand(b: Uint8Array): "image/avif" | "image/heic" | null {
  if (ascii(b, 4, 4) !== "ftyp") return null;
  const boxSize = Math.min(u32be(b, 0), 256, b.length);
  const brands = [ascii(b, 8, 4)];
  for (let i = 16; i + 4 <= boxSize; i += 4) brands.push(ascii(b, i, 4));
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return "image/avif";
  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return "image/heic";
  return null;
}

/** The format and size of an image, or null when it is not one of the accepted formats. */
export function sniffImage(bytes: Uint8Array): Sniffed | null {
  const b = bytes;
  if (b.length < 12) return null;
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: "image/jpeg", ...jpegSize(b) };
  if (ascii(b, 0, 8) === "\x89PNG\r\n\x1a\n") {
    return {
      type: "image/png",
      ...(ascii(b, 12, 4) === "IHDR" ? size(u32be(b, 16), u32be(b, 20)) : size(0, 0)),
    };
  }
  if (ascii(b, 0, 6) === "GIF87a" || ascii(b, 0, 6) === "GIF89a") {
    return { type: "image/gif", ...size(u16le(b, 6), u16le(b, 8)) };
  }
  if (ascii(b, 0, 4) === "RIFF" && ascii(b, 8, 4) === "WEBP") return { type: "image/webp", ...webpSize(b) };
  const iso = isoBrand(b);
  if (iso) return { type: iso, ...ispeSize(b) };
  return null;
}
