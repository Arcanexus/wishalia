/**
 * What another app shares with Wishalia (spec §5.1): the system's share menu on Android (Web Share
 * Target) and the iOS Shortcut both send a title, a text and a link, each optional. Apps fill them
 * in their own way: Chrome puts the page title in `title` and the link in `text`, a shop app puts
 * « Product name https://… » in `text`. Pure functions, no I/O.
 */

import { cleanUrl, MAX_TITLE_LENGTH } from "./items.js";

export interface Shared {
  title?: string | null;
  text?: string | null;
  url?: string | null;
}

/** The longest text taken from one shared field: more is not a wish, it is a page. */
export const MAX_SHARED_LENGTH = 4000;

const LINK = /https?:\/\/\S+/gi;

const tidy = (value: string | null | undefined) =>
  (value ?? "").slice(0, MAX_SHARED_LENGTH).replace(/\s+/g, " ").trim();

/** The words of a field, without its links, and without the punctuation left around them. */
const words = (value: string) =>
  value
    .replace(LINK, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s:,;–—-]+|[\s:,;–—-]+$/g, "")
    .trim();

/** The first http(s) link of a field, cleaned (no tracking parameter, never javascript:). */
function firstLink(value: string): string | null {
  for (const match of value.matchAll(LINK)) {
    const url = cleanUrl(match[0]);
    if (url) return url;
  }
  return null;
}

/**
 * The quick add input for what was shared: a few words, then the link. The link is the `url`
 * field, else the first link of the text, else of the title. The words are the longer of the
 * title and the text once their links are gone, so that a title like « Amazon.fr » does not win
 * over the product name in the text. The person sees the result and can change it before adding.
 */
export function sharedInput(shared: Shared): string {
  const title = tidy(shared.title);
  const text = tidy(shared.text);
  const url = tidy(shared.url);
  const link = cleanUrl(url) ?? firstLink(text) ?? firstLink(title);
  const fromTitle = words(title);
  const fromText = words(text);
  const chosen = (fromText.length > fromTitle.length ? fromText : fromTitle)
    .slice(0, MAX_TITLE_LENGTH)
    .trim();
  return [chosen, link].filter(Boolean).join(" ");
}
