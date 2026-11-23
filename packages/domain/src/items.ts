/**
 * Items as the owner edits them: the quick add, URL cleaning and the diff written to the history.
 * Pure functions, no I/O.
 */

/** Query parameters that only track people: removed from every stored URL. */
const TRACKING_PARAMS = [
  /^utm_/i,
  /^(fbclid|gclid|dclid|gbraid|wbraid|msclkid|yclid|twclid|igshid|mc_cid|mc_eid|_hsenc|_hsmi|ref_src|spm)$/i,
  /^(ref|tag|linkCode|linkId|psc|smid|pd_rd_\w+|pf_rd_\w+|content-id|_encoding|ascsubtag)$/,
];

export const MAX_TITLE_LENGTH = 300;

/**
 * Cleans a URL before it is stored: https only for http(s) links, no tracking parameter, no
 * fragment, lowercase host. Returns null for anything that is not an http(s) URL (javascript:,
 * data:, file:...), so that a stored link can never run code.
 */
export function cleanUrl(raw: string): string | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  for (const name of [...url.searchParams.keys()]) {
    if (TRACKING_PARAMS.some((pattern) => pattern.test(name))) url.searchParams.delete(name);
  }
  url.hash = "";
  url.hostname = url.hostname.toLowerCase();
  return url.toString();
}

export interface QuickAdd {
  title: string;
  url: string | null;
}

/**
 * The universal quick add field (spec §5.1): a URL, free text, or text with a URL in it. The item
 * is created at once with what is known; the worker enriches it later (§5.2).
 */
export function parseQuickAdd(input: string): QuickAdd | null {
  const text = input.replace(/\s+/g, " ").trim();
  if (!text) return null;
  const match = text.match(/https?:\/\/\S+/i);
  const url = match ? cleanUrl(match[0]) : null;
  const rest = match ? text.replace(match[0], "").trim() : text;
  const title = rest || (url ? placeholderTitle(url) : "");
  if (!title) return null;
  return { title: title.slice(0, MAX_TITLE_LENGTH), url };
}

/** The title shown until the enrichment finds the real one: the site name. */
export function placeholderTitle(url: string): string {
  return new URL(url).hostname.replace(/^www\./, "");
}

/** The fields of an item the owner edits, as stored. */
export interface EditableWish {
  title: string;
  url: string | null;
  notes: string | null;
  priceCents: number | null;
  targetCents: number | null;
  quantity: number | null;
  kind: "unique" | "quantity" | "pool";
  repeatable: boolean;
}

export type WishChanges = Partial<{
  [K in keyof EditableWish]: { from: EditableWish[K]; to: EditableWish[K] };
}>;

/**
 * What an edit changes, field by field, for the history ("updated" with a diff of the fields,
 * "price_changed" on its own, spec §7). Fields left out of the patch, or unchanged, are not listed.
 */
export function diffWish(before: EditableWish, patch: Partial<EditableWish>): WishChanges {
  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of Object.keys(patch) as (keyof EditableWish)[]) {
    const to = patch[key];
    if (to !== undefined && to !== before[key]) changes[key] = { from: before[key], to };
  }
  return changes as WishChanges;
}
