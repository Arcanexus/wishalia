import { MAX_TITLE_LENGTH, placeholderTitle } from "./items.js";

/**
 * Completing an item from its link (spec §5.2, §5.3): what the worker found, and what it may
 * change. The owner's own words always win: the title only replaces the placeholder (the site's
 * name) or the title the page gave before, and the price only fills an empty one or follows the
 * price the page gave before. A value the owner typed or changed is never replaced.
 */

/** What a page says about its product (JSON-LD, then Open Graph). */
export interface Found {
  title?: string | null;
  priceCents?: number | null;
  /** ISO 4217; a price in another currency than the euro is left out. */
  currency?: string | null;
}

export interface Completable {
  title: string;
  url: string | null;
  priceCents: number | null;
  /** The title the worker last wrote: while the item still has it, the page may change it. */
  foundTitle?: string | null;
  /** The price the worker last wrote: while the item still has it, the page may change it. */
  foundPriceCents?: number | null;
}

/** The highest price taken from a page: past it, a parsing mistake. */
export const MAX_FOUND_CENTS = 100_000_000;

/** The changes to write, empty when there is nothing to complete. */
export function completion(item: Completable, found: Found): { title?: string; priceCents?: number } {
  const patch: { title?: string; priceCents?: number } = {};
  const title = found.title?.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
  const pageTitle =
    (item.url !== null && item.title === placeholderTitle(item.url)) ||
    (!!item.foundTitle && item.title === item.foundTitle);
  if (title && item.url && pageTitle && title !== item.title) {
    patch.title = title;
  }
  const price = found.priceCents;
  const euros = !found.currency || found.currency.toUpperCase() === "EUR";
  const pagePrice =
    item.priceCents === null ||
    (item.foundPriceCents !== null &&
      item.foundPriceCents !== undefined &&
      item.priceCents === item.foundPriceCents);
  if (
    pagePrice &&
    price !== item.priceCents &&
    euros &&
    typeof price === "number" &&
    Number.isInteger(price) &&
    price > 0 &&
    price <= MAX_FOUND_CENTS
  ) {
    patch.priceCents = price;
  }
  return patch;
}

/** How many times the worker tries an item before it gives up. */
export const MAX_ENRICHMENT_ATTEMPTS = 3;

/**
 * Reading the links again, on the owner's demand (docs/enrichment.md): never a burst towards one
 * site. The items of a same site are spaced REFRESH_SPACING_MS apart, those of different sites go
 * side by side. Returns, for each item with a link, when the worker may take it.
 */
export const REFRESH_SPACING_MS = 5_000;

export function refreshSchedule(
  items: readonly { id: string; url: string | null }[],
  now: Date,
): Map<string, Date> {
  const perSite = new Map<string, number>();
  const schedule = new Map<string, Date>();
  for (const item of items) {
    if (!item.url) continue;
    const site = URL.parse(item.url)?.hostname.replace(/^www\./, "") ?? item.url;
    const rank = perSite.get(site) ?? 0;
    perSite.set(site, rank + 1);
    schedule.set(item.id, new Date(now.getTime() + rank * REFRESH_SPACING_MS));
  }
  return schedule;
}
