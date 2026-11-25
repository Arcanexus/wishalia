import { MAX_FOUND_CENTS } from "./enrichment.js";
import { cleanUrl, MAX_TITLE_LENGTH, parseQuickAdd, placeholderTitle } from "./items.js";

/**
 * Importing a list made elsewhere (docs/import.md): a Wishlistr list from its public address, a CSV
 * or JSON file (the exports of other services, a spreadsheet) or pasted text, one wish per line.
 * Each source is an importer: it turns what it reads into the same rows, which then go through
 * one normalisation (clean link, bounded text, price in euro cents). Pure functions, no I/O: the
 * API fetches and stores.
 *
 * What is read is never trusted: sizes are bounded before parsing, no HTML is ever kept (only
 * text), links go through cleanUrl (http(s) only, no tracking), amounts are integers in cents.
 */

export const IMPORT_SOURCES = ["wishlistr", "csv", "json", "text"] as const;
export type ImportSource = (typeof IMPORT_SOURCES)[number];

/** The largest file or text read (1 MB): far beyond any wishlist. */
export const MAX_IMPORT_BYTES = 1_000_000;
/** The most wishes taken from one import; the rest is reported as skipped. */
export const MAX_IMPORT_ITEMS = 500;
export const MAX_IMPORT_NOTES_LENGTH = 4000;
export const MAX_IMPORT_LIST_NAME_LENGTH = 100;
export const MAX_IMPORT_QUANTITY = 1000;

/** A wish as it will be added. */
export interface ImportedWish {
  title: string;
  url: string | null;
  notes: string | null;
  priceCents: number | null;
  /** How many are wanted, when more than one. */
  quantity: number | null;
}

export type ImportSkipReason = "no_title" | "too_many";

export interface ImportSkip {
  /** The row of the file, or the line of the text, counted from 1 (the header is row 1 of a CSV). */
  row: number;
  reason: ImportSkipReason;
}

/** What an import reads, shown to the owner before anything is added. */
export interface ImportPreview {
  source: ImportSource;
  /** The list's name, when the source gives one. */
  listName: string | null;
  items: ImportedWish[];
  skipped: ImportSkip[];
}

export type ImportErrorCode =
  | "empty"
  | "too_large"
  | "invalid_csv"
  | "invalid_json"
  | "no_columns"
  | "not_a_wishlistr_list"
  | "invalid_address";

/** A source that cannot be read at all. */
export class ImportError extends Error {
  constructor(readonly code: ImportErrorCode) {
    super(code);
  }
}

/** A row as an importer reads it, before the normalisation. */
export interface RawWish {
  title?: unknown;
  url?: unknown;
  notes?: unknown;
  price?: unknown;
  currency?: unknown;
  quantity?: unknown;
  /** An amount already in cents (a preview sent back): taken as it is when it is a valid one. */
  priceCents?: unknown;
}

// ---------------------------------------------------------------------------------------------
// Normalisation

/** Text as kept: no control character, spaces collapsed (newlines too, unless `lines`), bounded. */
export function cleanText(value: unknown, max: number, lines = false): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  let text = String(value)
    .normalize("NFC")
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, "");
  text = lines
    ? text
        .replace(/\r\n?/g, "\n")
        .split("\n")
        .map((line) => line.replace(/[ \t]+/g, " ").trim())
        .join("\n")
        .replace(/\n{3,}/g, "\n\n")
        .trim()
    : text.replace(/\s+/g, " ").trim();
  return text ? text.slice(0, max) : null;
}

const NOT_EUROS = /[$£¥₹₩₽]|\b(usd|gbp|chf|cad|aud|jpy|sek|nok|dkk|pln)\b/i;

/**
 * A price as an export writes it (12, 12.5, "12,50 €", "1 299,00", "1,299.00"), in euro cents.
 * Null when it is not a price, not in euros, negative or past MAX_FOUND_CENTS.
 */
export function importPrice(value: unknown, currency?: unknown): number | null {
  if (typeof currency === "string" && currency.trim() && currency.trim().toUpperCase() !== "EUR") return null;
  let cents: number | null = null;
  if (typeof value === "number") {
    cents = Number.isFinite(value) ? Math.round(value * 100) : null;
  } else if (typeof value === "string") {
    if (NOT_EUROS.test(value) || /^\s*-/.test(value)) return null;
    let text = value.replace(/[^\d.,]/g, "");
    if (!/\d/.test(text)) return null;
    // The last separator followed by one or two digits is the decimal one
    const decimal = Math.max(text.lastIndexOf(","), text.lastIndexOf("."));
    const decimals = decimal >= 0 ? text.length - decimal - 1 : 0;
    text =
      decimal >= 0 && decimals > 0 && decimals <= 2
        ? `${text.slice(0, decimal).replace(/[.,]/g, "")}.${text.slice(decimal + 1)}`
        : text.replace(/[.,]/g, "");
    const amount = Number(text);
    cents = Number.isFinite(amount) ? Math.round(amount * 100) : null;
  } else if (value && typeof value === "object") {
    // { amount: 12.5, currency: "EUR" } or { value: ... }
    const price = value as Record<string, unknown>;
    return importPrice(price.amount ?? price.value, price.currency ?? price.currencyCode ?? currency);
  }
  if (cents === null || !Number.isSafeInteger(cents) || cents < 0 || cents > MAX_FOUND_CENTS) return null;
  return cents;
}

/** A quantity of more than one, whole and bounded; null otherwise (one is the default). */
export function importQuantity(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim()) : NaN;
  if (!Number.isInteger(number) || number < 2) return null;
  return Math.min(number, MAX_IMPORT_QUANTITY);
}

/**
 * One row, normalised: a title is needed, the site's name standing in when there is only a link.
 * Null when there is neither.
 */
export function normalizeWish(raw: RawWish): ImportedWish | null {
  const rawUrl = typeof raw.url === "string" ? raw.url.trim() : "";
  const url = rawUrl ? cleanUrl(/^www\./i.test(rawUrl) ? `https://${rawUrl}` : rawUrl) : null;
  const title = cleanText(raw.title, MAX_TITLE_LENGTH) ?? (url ? placeholderTitle(url) : null);
  if (!title) return null;
  return {
    title,
    url,
    notes: cleanText(raw.notes, MAX_IMPORT_NOTES_LENGTH, true),
    priceCents:
      typeof raw.priceCents === "number" &&
      Number.isSafeInteger(raw.priceCents) &&
      raw.priceCents >= 0 &&
      raw.priceCents <= MAX_FOUND_CENTS
        ? raw.priceCents
        : importPrice(raw.price, raw.currency),
    quantity: importQuantity(raw.quantity),
  };
}

/** Builds the preview from raw rows: normalised, the empty ones and those past the limit skipped. */
export function collect(
  source: ImportSource,
  rows: { row: number; wish: RawWish }[],
  listName: unknown = null,
): ImportPreview {
  const items: ImportedWish[] = [];
  const skipped: ImportSkip[] = [];
  for (const { row, wish } of rows) {
    const normalized = normalizeWish(wish);
    if (!normalized) skipped.push({ row, reason: "no_title" });
    else if (items.length >= MAX_IMPORT_ITEMS) skipped.push({ row, reason: "too_many" });
    else items.push(normalized);
  }
  return { source, listName: cleanText(listName, MAX_IMPORT_LIST_NAME_LENGTH), items, skipped };
}

function checkSize(text: string): string {
  if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) throw new ImportError("too_large");
  const trimmed = text.replace(/^\uFEFF/, "");
  if (!trimmed.trim()) throw new ImportError("empty");
  return trimmed;
}

// ---------------------------------------------------------------------------------------------
// Column names: the words the exports of other services and spreadsheets use, in French, English,
// German and Spanish. Compared without case, accents, spaces or punctuation.

type Field = Exclude<keyof RawWish, "priceCents">;

const COLUMN_NAMES: Record<Field, string[]> = {
  title: [
    "title",
    "titre",
    "name",
    "nom",
    "item",
    "itemname",
    "itemtitle",
    "product",
    "productname",
    "produit",
    "article",
    "wish",
    "envie",
    "souhait",
    "cadeau",
    "gift",
    "giftname",
    "libelle",
    "designation",
    "titel",
    "artikel",
    "wunsch",
    "nombre",
    "titulo",
    "deseo",
  ],
  url: [
    "url",
    "link",
    "lien",
    "producturl",
    "productlink",
    "itemurl",
    "itemlink",
    "weblink",
    "href",
    "website",
    "siteweb",
    "adresse",
    "enlace",
  ],
  notes: [
    "notes",
    "note",
    "description",
    "comment",
    "comments",
    "commentaire",
    "commentaires",
    "details",
    "detail",
    "precisions",
    "remarque",
    "remarques",
    "beschreibung",
    "kommentar",
    "notizen",
    "descripcion",
    "comentario",
  ],
  price: [
    "price",
    "prix",
    "cost",
    "cout",
    "amount",
    "montant",
    "itemprice",
    "pricewhenadded",
    "prixunitaire",
    "preis",
    "precio",
  ],
  currency: ["currency", "currencycode", "devise", "monnaie", "wahrung", "moneda"],
  quantity: [
    "quantity",
    "quantite",
    "qty",
    "qte",
    "count",
    "requested",
    "quantityrequested",
    "desired",
    "wanted",
    "nombredexemplaires",
    "menge",
    "anzahl",
    "cantidad",
  ],
};

/** A column name compared loosely: « Quantité désirée » → "quantitedesiree". */
export function columnKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

const FIELD_OF = new Map<string, Field>(
  (Object.entries(COLUMN_NAMES) as [Field, string[]][]).flatMap(([field, names]) =>
    names.map((name) => [name, field] as const),
  ),
);

/** Which field a column feeds, by its name; undefined for a column of no use. */
export function fieldOfColumn(name: string): Field | undefined {
  return FIELD_OF.get(columnKey(name));
}

// ---------------------------------------------------------------------------------------------
// CSV (RFC 4180): commas, semicolons (French spreadsheets) or tabs, quotes, BOM, CRLF.

/** Guesses the separator from the first line, quotes aside. */
export function csvDelimiter(text: string): "," | ";" | "\t" {
  const counts = { ",": 0, ";": 0, "\t": 0 };
  let quoted = false;
  for (const char of text) {
    if (char === '"') quoted = !quoted;
    else if (!quoted && (char === "\n" || char === "\r")) break;
    else if (!quoted && char in counts) counts[char as keyof typeof counts] += 1;
  }
  if (counts[";"] > counts[","] && counts[";"] >= counts["\t"]) return ";";
  if (counts["\t"] > counts[","]) return "\t";
  return ",";
}

/** The records of a CSV, as arrays of cells, blank ones included. A quote left open is an error. */
export function parseCsvRows(text: string, delimiter = csvDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"' && cell === "") quoted = true;
    else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new ImportError("invalid_csv");
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

const isBlank = (cells: string[]) => cells.every((value) => value.trim() === "");

/**
 * A CSV with a header row: the columns are found by their names (title, url, price…, see
 * COLUMN_NAMES). Exports of Amazon list extensions, Giftster, MyRegistry, a spreadsheet: all fit.
 */
export function importCsv(input: string): ImportPreview {
  const text = checkSize(input);
  const all = parseCsvRows(text);
  const start = all.findIndex((cells) => !isBlank(cells));
  const header = all[start];
  const rows = all.slice(start + 1);
  const columns = new Map<Field, number>();
  header?.forEach((name, index) => {
    const field = fieldOfColumn(name);
    if (field && !columns.has(field)) columns.set(field, index);
  });
  if (!columns.has("title") && !columns.has("url")) throw new ImportError("no_columns");
  return collect(
    "csv",
    rows.flatMap((cells, index) => {
      if (isBlank(cells)) return [];
      const wish: RawWish = {};
      for (const [field, column] of columns) wish[field] = cells[column];
      return [{ row: start + index + 2, wish }];
    }),
  );
}

// ---------------------------------------------------------------------------------------------
// JSON: an array of wishes, or an object holding one (items, wishes, gifts…) with the list's name.

const ARRAY_KEYS = ["items", "wishes", "gifts", "products", "envies", "cadeaux", "articles", "entries"];
const NAME_KEYS = ["name", "title", "listname", "nom", "titre"];

function fieldsOf(entry: unknown): RawWish {
  if (typeof entry === "string") return parseQuickAdd(entry) ?? {};
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return {};
  const wish: RawWish = {};
  for (const [key, value] of Object.entries(entry as Record<string, unknown>)) {
    const field = fieldOfColumn(key);
    if (field && wish[field] === undefined) wish[field] = value;
  }
  return wish;
}

export function importJson(input: string): ImportPreview {
  const text = checkSize(input);
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ImportError("invalid_json");
  }
  let entries: unknown[] | undefined;
  let listName: unknown = null;
  if (Array.isArray(data)) entries = data;
  else if (data && typeof data === "object") {
    const object = data as Record<string, unknown>;
    const keys = new Map(Object.keys(object).map((key) => [columnKey(key), key]));
    const arrayKey = ARRAY_KEYS.map((key) => keys.get(key)).find(
      (key) => key !== undefined && Array.isArray(object[key]),
    );
    entries = arrayKey ? (object[arrayKey] as unknown[]) : undefined;
    const nameKey = NAME_KEYS.map((key) => keys.get(key)).find(
      (key) => key !== undefined && typeof object[key] === "string",
    );
    listName = nameKey ? object[nameKey] : null;
  }
  if (!entries) throw new ImportError("no_columns");
  return collect(
    "json",
    entries.map((entry, index) => ({ row: index + 1, wish: fieldsOf(entry) })),
    listName,
  );
}

// ---------------------------------------------------------------------------------------------
// Text: one wish per line, as the quick add reads it (a link, words, or both). Fits a list copied
// from any page or note.

export function importText(input: string): ImportPreview {
  const text = checkSize(input);
  return collect(
    "text",
    text
      .split(/\r\n?|\n/)
      .map((line, index) => ({ row: index + 1, line: line.replace(/^\s*([-*•·]|\d+[.)])\s+/, "") }))
      .filter(({ line }) => line.trim() !== "")
      .map(({ row, line }) => ({ row, wish: parseQuickAdd(line) ?? {} })),
  );
}

// ---------------------------------------------------------------------------------------------
// Wishlistr (wishlistr.com): no export file, but every list has a public page (the address the
// owner shares). Its items carry a title, a comment and the shop's link; the page is read as text,
// never kept. Only www.wishlistr.com is ever fetched, at an address built here.

const WISHLISTR_HOSTS = new Set(["wishlistr.com", "www.wishlistr.com"]);
/** Pages of the site that are not a list. */
const WISHLISTR_RESERVED = new Set([
  "about",
  "blog",
  "contact",
  "dp",
  "go",
  "help",
  "home",
  "images",
  "login",
  "profile",
  "reserve",
  "rss",
  "sign-up",
  "tools",
  "your-list",
]);
const WISHLISTR_USER = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/;

/**
 * The page to read for a Wishlistr list, from the address the owner pastes
 * (« wishlistr.com/alex », « https://www.wishlistr.com/alex/ »). Always
 * https://www.wishlistr.com/<user>/: nothing else can be fetched through it.
 */
export function wishlistrAddress(input: string): string {
  const raw = input.trim();
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new ImportError("invalid_address");
  }
  if (
    (url.protocol !== "https:" && url.protocol !== "http:") ||
    url.username ||
    url.password ||
    (url.port && url.port !== "443" && url.port !== "80") ||
    !WISHLISTR_HOSTS.has(url.hostname.toLowerCase())
  ) {
    throw new ImportError("invalid_address");
  }
  const [user] = url.pathname.split("/").filter(Boolean);
  if (!user || !WISHLISTR_USER.test(user) || WISHLISTR_RESERVED.has(user.toLowerCase())) {
    throw new ImportError("invalid_address");
  }
  return `https://www.wishlistr.com/${encodeURIComponent(user)}/`;
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

/** Decodes the HTML entities of a text or an attribute. */
export function decodeEntities(text: string): string {
  return text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === "#") {
      const code = name[1]?.toLowerCase() === "x" ? parseInt(name.slice(2), 16) : parseInt(name.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

/** The text of a piece of HTML: every tag dropped (<br> becomes a new line), entities decoded. */
export function htmlText(html: string): string {
  let text = "";
  let index = 0;
  while (index < html.length) {
    const open = html.indexOf("<", index);
    if (open === -1) {
      text += html.slice(index);
      break;
    }
    text += html.slice(index, open);
    const close = html.indexOf(">", open);
    if (close === -1) break;
    if (/^<br\b/i.test(html.slice(open, open + 4))) text += "\n";
    index = close + 1;
  }
  return decodeEntities(text);
}

/** The inside of the first <tag …>…</tag> after `from` whose opening tag matches. */
function element(
  html: string,
  tag: string,
  opening: RegExp,
  from = 0,
): { inner: string; end: number } | null {
  const pattern = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  pattern.lastIndex = from;
  for (let match = pattern.exec(html); match; match = pattern.exec(html)) {
    if (!opening.test(match[0])) continue;
    const start = match.index + match[0].length;
    const end = html.toLowerCase().indexOf(`</${tag}>`, start);
    if (end === -1) return null;
    return { inner: html.slice(start, end), end: end + tag.length + 3 };
  }
  return null;
}

/** The value of one attribute of an opening tag. */
function attribute(tag: string, name: string): string | null {
  const match = new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i").exec(tag);
  return match ? decodeEntities(match[2] ?? match[3] ?? "") : null;
}

/**
 * The items of a Wishlistr list page (<ul id="wishlist">): each <li> gives its <h3> (the title),
 * its <p> (the comment) and its "Buy or view this item" link, whose title attribute holds the
 * shop's address (the href goes through Wishlistr's redirect, never followed).
 */
export function importWishlistrPage(html: string): ImportPreview {
  if (html.length > 3 * MAX_IMPORT_BYTES) throw new ImportError("too_large");
  const list = element(html, "ul", /\sid\s*=\s*["']wishlist["']/i);
  if (!list) throw new ImportError("not_a_wishlistr_list");
  const heading = element(html, "h2", /\sid\s*=\s*["']wishlist-title["']/i);

  const rows: { row: number; wish: RawWish }[] = [];
  const items = list.inner.split(/<li\b[^>]*>/i).slice(1);
  items.forEach((item, index) => {
    const title = element(item, "h3", /./);
    const comment = element(item, "p", /./);
    const linkTag = /<a\b[^>]*>/gi;
    let url: string | null = null;
    for (let match = linkTag.exec(item); match && !url; match = linkTag.exec(item)) {
      const target = attribute(match[0], "title");
      if (target && /^https?:\/\//i.test(target.trim())) url = target.trim();
    }
    rows.push({
      row: index + 1,
      wish: {
        title: title ? htmlText(title.inner) : null,
        notes: comment ? htmlText(comment.inner) : null,
        url,
      },
    });
  });
  return collect("wishlistr", rows, heading ? htmlText(heading.inner) : null);
}

// ---------------------------------------------------------------------------------------------

/** The importer of a file or a pasted text, by its source. */
export const FILE_IMPORTERS: Record<Exclude<ImportSource, "wishlistr">, (text: string) => ImportPreview> = {
  csv: importCsv,
  json: importJson,
  text: importText,
};

/** Which importer reads a file, from its name and its first characters. */
export function sourceOfFile(name: string, text: string): Exclude<ImportSource, "wishlistr"> {
  const extension = name.toLowerCase().split(".").pop() ?? "";
  if (extension === "json") return "json";
  if (extension === "csv" || extension === "tsv") return "csv";
  const start = text.replace(/^\uFEFF/, "").trimStart();
  if (start.startsWith("[") || start.startsWith("{")) return "json";
  const firstLine = start.split(/\r?\n/, 1)[0] ?? "";
  if (
    /[,;\t]/.test(firstLine) &&
    firstLine.split(/[,;\t]/).some((cell) => fieldOfColumn(cell.replace(/"/g, "")))
  )
    return "csv";
  return "text";
}
