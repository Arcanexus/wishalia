import { MAX_TITLE_LENGTH, placeholderTitle } from "./items.js";

/**
 * Completing an item from its link (spec §5.2, §5.3): what the worker found, and what it may
 * change. The owner's own words always win: the title only replaces the placeholder (the site's
 * name) and the price only fills an empty one.
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
}

/** The highest price taken from a page: past it, a parsing mistake. */
export const MAX_FOUND_CENTS = 100_000_000;

/** The changes to write, empty when there is nothing to complete. */
export function completion(item: Completable, found: Found): { title?: string; priceCents?: number } {
  const patch: { title?: string; priceCents?: number } = {};
  const title = found.title?.replace(/\s+/g, " ").trim().slice(0, MAX_TITLE_LENGTH);
  if (title && item.url && item.title === placeholderTitle(item.url) && title !== item.title) {
    patch.title = title;
  }
  const price = found.priceCents;
  const euros = !found.currency || found.currency.toUpperCase() === "EUR";
  if (
    item.priceCents === null &&
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
