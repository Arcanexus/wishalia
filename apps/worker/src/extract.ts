import { decodeEntities, type Found } from "@wishalia/domain";

/**
 * What a product page says about itself (spec §5.3), in cascade: the JSON-LD `schema.org/Product`
 * first, then the Open Graph and Twitter tags, then the price shown in the page itself (microdata,
 * the shops that write neither, such as Amazon), then the page's <title>. Pure: the HTML in, what was
 * found out. No HTML is ever kept or shown: only a title and a price, as text and a number, and the
 * links of its images (fetched and checked apart).
 */

/** Decodes the HTML entities of an attribute or a <title> (the shared table of @wishalia/domain). */
export { decodeEntities };

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

/** The first amount of a text ("19,99 € - 29,99 €" → "19,99"), or the text when it has none. */
function firstAmount(text: string): string {
  return text.match(/\d[\d\s\u00a0\u202f.,]*\d|\d/)?.[0] ?? text;
}

/** The currency a price is written with: ISO 4217 as is, or its usual symbol. */
export function currencyOf(text: string | null | undefined): string | null {
  if (!text) return null;
  const code = text.match(/\b(EUR|USD|GBP|CHF|CAD|JPY)\b/i)?.[1];
  if (code) return code.toUpperCase();
  if (text.includes("€")) return "EUR";
  if (text.includes("£")) return "GBP";
  if (text.includes("¥") || text.includes("￥")) return "JPY";
  if (text.includes("$")) return "USD";
  return null;
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

/** The text of an element, tags removed and entities decoded. */
const textOf = (inner: string) =>
  decodeEntities(inner.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

/** An Amazon product page (any country), from the ids of its layout. */
const isAmazon = (html: string) =>
  /\bid\s*=\s*["'](productTitle|dp|ppd|centerCol|corePrice_feature_div)["']/i.test(html);

/** The elements that hold the price Amazon shows to buy (desktop and mobile layouts). */
const AMAZON_PRICE_BLOCKS = [
  "corePrice_feature_div",
  "corePriceDisplay_desktop_feature_div",
  "corePrice_desktop",
  "corePrice_mobile_feature_div",
  "apex_desktop",
  "apex_offerDisplay_desktop",
  "price_inside_buybox",
  "priceblock_dealprice",
  "priceblock_ourprice",
  "priceblock_saleprice",
  "tp_price_block_total_price_ww",
  "kindle-price",
  "price",
];

/** The few kilobytes after an element's id: where its price is written. */
function after(html: string, id: string): string | null {
  const at = html.search(new RegExp(`\\bid\\s*=\\s*["']${id}["']`, "i"));
  return at < 0 ? null : html.slice(at, at + 6000);
}

/**
 * Amazon (every country) writes no JSON-LD and no price tag: the price is in the page, in a hidden
 * text for screen readers (`a-offscreen`), split in whole and fraction, or in hidden fields.
 */
function fromAmazon(html: string): Found {
  if (!isAmazon(html)) return {};
  const title = html.match(/<span\b[^>]*\bid\s*=\s*["']productTitle["'][^>]*>([\s\S]*?)<\/span>/i)?.[1];
  const found: Found = { title: title ? textOf(title) || null : null, priceCents: null, currency: null };
  for (const id of AMAZON_PRICE_BLOCKS) {
    const zone = after(html, id);
    if (!zone) continue;
    // Where the price to pay starts: a discount line may come before it
    const pay = zone.search(/\b(apex)?priceToPay\b/i);
    const block = pay >= 0 ? zone.slice(pay) : zone;
    // The price's own data comes first: a later hidden text is the « Prix conseillé »
    const offscreen = block.match(/class\s*=\s*["'][^"']*\ba(?:ok)?-offscreen\b[^"']*["'][^>]*>([^<]+)</i);
    const whole = block.match(/class\s*=\s*["'][^"']*\ba-price-whole\b[^"']*["'][^>]*>([^<]*\d[^<]*)/i);
    const shown = offscreen?.[1] ? textOf(offscreen[1]) : "";
    const shownCents = priceToCents(firstAmount(shown));
    if (shownCents !== null && (!whole || (offscreen?.index ?? 0) < (whole.index ?? 0))) {
      return { ...found, priceCents: shownCents, currency: currencyOf(shown) };
    }
    if (whole?.[1]) {
      const fraction =
        block.match(/class\s*=\s*["'][^"']*\ba-price-fraction\b[^"']*["'][^>]*>(\d+)/i)?.[1] ?? "00";
      const symbol = block.match(/class\s*=\s*["'][^"']*\ba-price-symbol\b[^"']*["'][^>]*>([^<]+)/i)?.[1];
      const cents = priceToCents(`${decodeEntities(whole[1]).replace(/\D/g, "")}.${fraction}`);
      if (cents !== null) return { ...found, priceCents: cents, currency: currencyOf(symbol) };
    }
  }
  // The hidden fields of the "add to cart" form, then the data of the variants' selector
  for (const match of html.matchAll(/<input\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    if (
      ["attach-base-product-price", "twister-plus-price-data-price"].includes(tag.id ?? "") ||
      /customerVisiblePrice\]\[amount\]$/.test(tag.name ?? "")
    ) {
      const cents = priceToCents(tag.value);
      if (cents !== null) {
        const unit = html.match(
          /<input\b[^>]*(?:id\s*=\s*["'](?:attach-currency-of-preference|twister-plus-price-data-price-unit)["']|name\s*=\s*["'][^"']*customerVisiblePrice\]\[currencyCode\]["'])[^>]*>/i,
        )?.[0];
        return { ...found, priceCents: cents, currency: currencyOf(unit ? attributes(unit).value : null) };
      }
    }
  }
  const json = html.match(/"priceAmount"\s*:\s*"?(\d+(?:\.\d+)?)/)?.[1];
  if (json) {
    const code = html.match(/"currencyCode"\s*:\s*"([A-Z]{3})"/)?.[1] ?? null;
    return { ...found, priceCents: priceToCents(Number(json)), currency: code };
  }
  return found;
}

/** Microdata (`itemprop="price"`) on any element: its `content`, or its text. */
function fromMicrodata(html: string): Found {
  for (const match of html.matchAll(/<([a-z]+)\b[^>]*\bitemprop\s*=\s*["']price["'][^>]*>/gi)) {
    const tag = attributes(match[0]);
    let value = tag.content;
    if (value === undefined) {
      const rest = html.slice((match.index ?? 0) + match[0].length);
      const end = rest.search(new RegExp(`</${match[1]}\\s*>`, "i"));
      value = textOf(rest.slice(0, end < 0 ? 200 : Math.min(end, 200)));
    }
    const cents = priceToCents(firstAmount(value));
    if (cents === null) continue;
    const unit = html.match(/<[a-z]+\b[^>]*\bitemprop\s*=\s*["']priceCurrency["'][^>]*>/i)?.[0];
    return { priceCents: cents, currency: (unit && attributes(unit).content) || currencyOf(value) };
  }
  return {};
}

/** The price shown in the page itself, when it says nothing in its tags. */
function fromPage(html: string): Found {
  const amazon = fromAmazon(html);
  if (amazon.priceCents !== null && amazon.priceCents !== undefined) return amazon;
  return { title: amazon.title ?? null, ...fromMicrodata(html) };
}

/**
 * Whether the page is a wall put up against robots (a CAPTCHA, « Continuer vos achats »), not the
 * product: the worker then tries again later, and says the link could not be read.
 */
export function isBotWall(html: string): boolean {
  if (/\bid\s*=\s*["']productTitle["']/i.test(html)) return false;
  return (
    /\/errors\/validateCaptcha|api-services-support@amazon\.com/i.test(html) ||
    /<title\b[^>]*>\s*(Robot Check|Attention Required!|Just a moment\.\.\.)\s*<\/title>/i.test(html) ||
    /\bcf-chl-|captcha-delivery\.com|px-captcha/i.test(html)
  );
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

/** Amazon's product photos live under /images/I/; its banners, logos and ads under /images/G/ and others. */
const AMAZON_PHOTO = /^https?:\/\/[^/]*(media-amazon\.com|ssl-images-amazon\.com)\/images\/I\//i;

/** An Amazon photo at 1500 pixels: a thumbnail's link (…._AC_US40_.jpg) without its small size. */
export function amazonLarge(link: string): string {
  return link.replace(/\._[^/]*?_\.(jpe?g|png|webp|gif)$/i, "._AC_SL1500_.$1");
}

/**
 * The photos of an Amazon product, best first. Amazon writes no JSON-LD and no sharing image, and
 * its page starts with banners and ads: the photo shown big (`#landingImage`, `#imgBlkFront` for a
 * book), in its largest size (`data-old-hires`, the biggest of `data-a-dynamic-image`), then the
 * gallery (`"hiRes"`, else `"large"`), or without one the product photos of the page; never a
 * banner, a logo or an ad.
 */
function amazonImages(html: string): string[] {
  const main: string[] = [];
  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const tag = attributes(match[0]);
    if (!["landingImage", "imgBlkFront", "ebooksImgBlkFront", "main-image"].includes(tag.id ?? "")) continue;
    if (tag["data-old-hires"]) main.push(tag["data-old-hires"]);
    try {
      const sizes = JSON.parse(tag["data-a-dynamic-image"] ?? "{}") as Record<string, unknown>;
      const area = (size: unknown) => (Array.isArray(size) ? Number(size[0]) * Number(size[1]) || 0 : 0);
      main.push(...Object.keys(sizes).sort((a, b) => area(sizes[b]) - area(sizes[a])));
    } catch {
      // A broken list of sizes: the other links still count
    }
    if (tag.src) main.push(tag.src);
  }
  // The gallery: one entry per photo, its largest size (each size of a photo has its own link)
  const gallery: string[] = [];
  for (const entry of html.matchAll(/\{\s*"hiRes"\s*:\s*(?:null|"([^"]+)")[^{}]*?"large"\s*:\s*"([^"]+)"/g)) {
    const link = entry[1] ?? entry[2];
    if (link) gallery.push(link.replace(/\\\//g, "/"));
  }
  // Without a gallery, the product photos of the page (the thumbnails, at a larger size)
  const photos =
    gallery.length > 0
      ? []
      : bodyImages(html)
          .filter((link) => !/play/i.test(link))
          .map(amazonLarge);
  // One link per photo: the same photo comes in several sizes, the first (largest) one wins
  const seen = new Set<string>();
  return [...main, ...gallery, ...photos]
    .map((link) => decodeEntities(link).trim())
    .filter((link) => {
      if (!AMAZON_PHOTO.test(link)) return false;
      const photo = link.match(/\/images\/I\/([^./]+)/)?.[1] ?? link;
      if (seen.has(photo)) return false;
      seen.add(photo);
      return true;
    });
}

/**
 * The images the page proposes for its product, best first: the product's own (JSON-LD), the
 * sharing image (Open Graph, Twitter), then the photos of the page. Links only, unchecked: the
 * worker fetches each one through the same guard as the page, and keeps real images only.
 */
export function extractImages(html: string): string[] {
  if (isAmazon(html)) return amazonImages(html);
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

const hasPrice = (found: Found) => found.priceCents !== null && found.priceCents !== undefined;

/** Title and price, each from the first source that has it. */
export function extract(html: string): Found {
  const ld = fromJsonLd(html);
  const meta = fromMeta(html);
  const page = fromPage(html);
  const source = [ld, meta, page].find(hasPrice);
  return {
    title: ld.title || meta.title || page.title || fromTitle(html),
    priceCents: source?.priceCents ?? null,
    currency: source?.currency ?? null,
  };
}
