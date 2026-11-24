import type { Found } from "@wishalia/domain";

/**
 * What a product page says about itself (spec §5.3), in cascade: the JSON-LD `schema.org/Product`
 * first, then the Open Graph and Twitter tags, then the page's <title>. Pure: the HTML in, what was
 * found out. No HTML is ever kept or shown: only a title and a price, as text and a number, and the
 * links of its images (fetched and checked apart).
 */

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decodes the HTML entities of an attribute or a <title>. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** The attributes of one tag: <meta property="og:title" content="…"> → { property, content }. */
function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const match of tag.matchAll(/([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+))/gi)) {
    const name = match[1]?.toLowerCase();
    if (name) result[name] = decodeEntities(match[3] ?? match[4] ?? match[5] ?? "");
  }
  return result;
}

/** A price as a page writes it (49.9, "49,90", "1 299,00 €", "1,299.00"), in cents. */
export function priceToCents(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) : null;
  if (typeof value !== "string") return null;
  let text = value.replace(/[^\d.,]/g, "");
  if (!/\d/.test(text)) return null;
  const lastComma = text.lastIndexOf(",");
  const lastDot = text.lastIndexOf(".");
  // The last separator followed by one or two digits is the decimal one
  const decimal = Math.max(lastComma, lastDot);
  const decimals = decimal >= 0 ? text.length - decimal - 1 : 0;
  if (decimal >= 0 && decimals > 0 && decimals <= 2) {
    text = `${text.slice(0, decimal).replace(/[.,]/g, "")}.${text.slice(decimal + 1)}`;
  } else {
    text = text.replace(/[.,]/g, "");
  }
  const amount = Number(text);
  return Number.isFinite(amount) ? Math.round(amount * 100) : null;
}

const isProduct = (node: Record<string, unknown>) => {
  const type = node["@type"];
  return Array.isArray(type) ? type.includes("Product") : type === "Product";
};

/** Every object of a JSON-LD document, @graph and nesting included. */
function* nodes(value: unknown, depth = 0): Generator<Record<string, unknown>> {
  if (depth > 6 || value === null || typeof value !== "object") return;
  if (Array.isArray(value)) {
    for (const entry of value) yield* nodes(entry, depth + 1);
    return;
  }
  const node = value as Record<string, unknown>;
  yield node;
  for (const key of ["@graph", "mainEntity", "itemListElement"]) {
    if (key in node) yield* nodes(node[key], depth + 1);
  }
}

function offerPrice(offers: unknown): { priceCents: number | null; currency: string | null } {
  for (const offer of nodes(offers)) {
    const price = offer.price ?? offer.lowPrice ?? (offer.priceSpecification as { price?: unknown })?.price;
    const priceCents = priceToCents(price);
    if (priceCents !== null) {
      const currency =
        offer.priceCurrency ?? (offer.priceSpecification as { priceCurrency?: unknown })?.priceCurrency;
      return { priceCents, currency: typeof currency === "string" ? currency : null };
    }
  }
  return { priceCents: null, currency: null };
}

function fromJsonLd(html: string): Found {
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let document: unknown;
    try {
      document = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    for (const node of nodes(document)) {
      if (!isProduct(node)) continue;
      const name = typeof node.name === "string" ? decodeEntities(node.name) : null;
      return { title: name, ...offerPrice(node.offers) };
    }
  }
  return {};
}

function fromMeta(html: string): Found {
  const meta = new Map<string, string>();
  for (const match of html.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    const key = (tag.property ?? tag.name ?? tag.itemprop)?.toLowerCase();
    if (key && tag.content !== undefined && !meta.has(key)) meta.set(key, tag.content);
  }
  const amount = meta.get("product:price:amount") ?? meta.get("og:price:amount") ?? meta.get("price");
  const currency =
    meta.get("product:price:currency") ?? meta.get("og:price:currency") ?? meta.get("pricecurrency") ?? null;
  return {
    title: meta.get("og:title") ?? meta.get("twitter:title") ?? null,
    priceCents: priceToCents(amount),
    currency,
  };
}

function fromTitle(html: string): string | null {
  const title = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  return title ? decodeEntities(title).replace(/\s+/g, " ").trim() || null : null;
}

/** The links of a JSON-LD "image": a text, an ImageObject, or a list of either. */
function ldImages(value: unknown, depth = 0): string[] {
  if (depth > 3) return [];
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap((entry) => ldImages(entry, depth + 1));
  if (value && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return ldImages(object.contentUrl ?? object.url, depth + 1);
  }
  return [];
}

function productImages(html: string): string[] {
  for (const match of html.matchAll(
    /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi,
  )) {
    let document: unknown;
    try {
      document = JSON.parse(match[1] ?? "");
    } catch {
      continue;
    }
    for (const node of nodes(document)) {
      if (isProduct(node)) return ldImages(node.image).map(decodeEntities);
    }
  }
  return [];
}

/** A picture of the page's body that looks like a photo of the product, not a logo or an icon. */
const NOT_A_PHOTO = /\.svg(\?|$)|^data:|logo|icon|sprite|pixel|avatar|badge|flag|placeholder|spinner|loader/i;

function bodyImages(html: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    const src = tag["data-src"] || tag["data-zoom-image"] || tag["data-old-hires"] || tag.src;
    if (!src || NOT_A_PHOTO.test(src)) continue;
    const small = ["width", "height"].some((side) => {
      const value = Number.parseInt(tag[side] ?? "", 10);
      return Number.isFinite(value) && value < 120;
    });
    if (!small) links.push(src);
  }
  return links;
}

/**
 * The images the page proposes for its product, best first: the product's own (JSON-LD), the
 * sharing image (Open Graph, Twitter), then the photos of the page. Links only, unchecked: the
 * worker fetches each one through the same guard as the page, and keeps real images only.
 */
export function extractImages(html: string): string[] {
  const meta: string[] = [];
  for (const match of html.matchAll(/<(meta|link)\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    const key = (tag.property ?? tag.name ?? tag.rel)?.toLowerCase();
    const value = tag.content ?? tag.href;
    if (
      value &&
      key &&
      [
        "og:image",
        "og:image:secure_url",
        "og:image:url",
        "twitter:image",
        "twitter:image:src",
        "image_src",
      ].includes(key)
    ) {
      meta.push(value);
    }
  }
  return [...productImages(html), ...meta, ...bodyImages(html)].map((link) => link.trim()).filter(Boolean);
}

/** Title and price, each from the first source that has it. */
export function extract(html: string): Found {
  const ld = fromJsonLd(html);
  const meta = fromMeta(html);
  const price =
    ld.priceCents !== null && ld.priceCents !== undefined
      ? { priceCents: ld.priceCents, currency: ld.currency ?? null }
      : { priceCents: meta.priceCents ?? null, currency: meta.currency ?? null };
  return { title: ld.title || meta.title || fromTitle(html), ...price };
}
