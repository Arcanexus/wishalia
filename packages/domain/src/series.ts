/**
 * Series (docs/series.md): a wish of kind « series » that groups volumes, each one an ordinary
 * wish of the same list (its own name or number, price, link and image), given one by one. Pure
 * functions, no I/O.
 */

import { MAX_TITLE_LENGTH } from "./items.js";

/** Most volumes one series holds, and most wishes grouped at once. */
export const MAX_VOLUMES = 200;

/**
 * Words that only announce the number that follows: « T30 », « Tome 30 », « Vol. 2 », « n°4 ».
 * They are left out of the series' name found from its volumes.
 */
const NUMBER_WORDS =
  /^(t|tome|tomes|vol|vol\.|volume|volumes|n°|no|no\.|#|livre|book|part|partie|épisode|episode|saison|season|-|–|—|:|,|\/|\()$/i;

/** A volume's number at the end of a title: « 30 », « T30 », « #4 », « n°2 », « Vol.3 », « IV ». */
const VOLUME_NUMBER = /^(t|tome|vol\.?|n°|no\.?|#)?(\d+|[ivxlc]+)\)?$/i;

/** Spaces and punctuation left at the end of a guessed name. */
const TRAILING = /[\s,:;–—-]/u;

/** A name without the spaces and punctuation at its end, in one pass (no regex that backtracks). */
function trimTrailing(text: string): string {
  let end = text.length;
  while (end > 0 && TRAILING.test(text[end - 1] ?? "")) end -= 1;
  return text.slice(0, end);
}

/** The words of a title, split on spaces. */
const wordsOf = (title: string) => title.trim().split(/\s+/u).filter(Boolean);

/**
 * The name of a series, guessed from the titles of the wishes grouped into it: the words they all
 * start with, without a last word that announces a number (« Dragon Ball Perfect Edition T30 » and
 * « … T31 » → « Dragon Ball Perfect Edition »). Falls back on the first title when they share
 * nothing, and on null when there is no title at all. A single title loses the number at its end.
 */
export function seriesTitleOf(titles: readonly string[]): string | null {
  const lists = titles.map(wordsOf).filter((words) => words.length > 0);
  const [head, ...rest] = lists;
  if (!head) return null;
  if (rest.length === 0) {
    // One wish: its name without the number at its end (« Dragon Ball T30 » → « Dragon Ball »)
    let words = head;
    if (words.length > 1 && VOLUME_NUMBER.test(words[words.length - 1] ?? "")) {
      words = words.slice(0, -1);
      while (words.length > 1 && NUMBER_WORDS.test(words[words.length - 1] ?? "")) words = words.slice(0, -1);
    }
    return trimTrailing(words.join(" ")).slice(0, MAX_TITLE_LENGTH) || head.join(" ");
  }
  let common = 0;
  while (
    common < head.length &&
    rest.every((words) => words[common]?.toLocaleLowerCase() === head[common]?.toLocaleLowerCase())
  ) {
    common += 1;
  }
  let words = head.slice(0, common);
  // « Dragon Ball T » (from « T30 », « T31 ») or « Harry Potter, tome »: drop what announces a number
  while (words.length > 0 && NUMBER_WORDS.test(words[words.length - 1] ?? "")) words = words.slice(0, -1);
  const found = trimTrailing(words.join(" "));
  return (found || head.join(" ")).slice(0, MAX_TITLE_LENGTH);
}

/**
 * What a volume is called inside its series: its title without the series' name in front, when it
 * starts with it (« Dragon Ball Perfect Edition T30 » in « Dragon Ball Perfect Edition » → « T30 »).
 * The title itself is kept as it is: taken out of the series, the wish keeps its whole name.
 */
export function volumeLabel(title: string, seriesTitle: string): string {
  const name = seriesTitle.trim();
  if (!name) return title;
  if (title.slice(0, name.length).toLocaleLowerCase() !== name.toLocaleLowerCase()) return title;
  const rest = title.slice(name.length);
  // Only on a word boundary: « Dragon Balls » is not a volume of « Dragon Ball »
  if (rest && !/^[\s,:;–—(-]/u.test(rest)) return title;
  const label = rest.replace(/^[\s,:;–—-]+/u, "").trim();
  return label || title;
}

/** A volume's number in its title: « T30 », « Tome 33 », « Vol. 2 », « n°4 », « #5 », or a lone « 30 » at its end. */
const NUMBERED = /(?:^|[^\p{L}\d])(?:t|tome|vol\.?|volume|n°|no\.?|#)\s*(\d{1,4})(?!\d)/giu;
const TRAILING_NUMBER = /(?:^|\s)(\d{1,4})\s*$/u;

/**
 * The number of a volume, read from its title, for a short name on its tile (« Tome 33 ») when
 * its title says more than the series' name and its number (« Dragon Ball - Le Défi Tome 33 :
 * Dragon Ball perfect edition - Tome 33 »). The last one written wins; null when there is none.
 */
export function volumeNumber(title: string): string | null {
  const found = [...title.matchAll(NUMBERED)].at(-1)?.[1] ?? TRAILING_NUMBER.exec(title)?.[1] ?? null;
  return found === null ? null : String(Number(found));
}

const collator = new Intl.Collator("fr", { numeric: true, sensitivity: "base" });

/** Volumes in their reading order, by their names: « T2 » before « T10 ». A stable sort. */
export function inReadingOrder<T extends { title: string }>(volumes: readonly T[]): T[] {
  return volumes
    .map((volume, index) => ({ volume, index }))
    .sort((a, b) => collator.compare(a.volume.title, b.volume.title) || a.index - b.index)
    .map(({ volume }) => volume);
}

/** A wish as far as grouping it goes. */
export interface Groupable {
  id: string;
  listId: string;
  kind: "unique" | "quantity" | "pool" | "series";
  parentId: string | null;
}

/** Why a wish cannot go into a series. */
export type GroupRefusal = "is_series" | "other_list" | "not_series";

/**
 * Whether a wish may become a volume of a series: a wish of the same list, never a series itself
 * (no series in a series). A wish already in another series moves to this one.
 */
export function refuseVolume(wish: Groupable, series: Groupable): GroupRefusal | null {
  if (series.kind !== "series") return "not_series";
  if (wish.kind === "series") return "is_series";
  if (wish.listId !== series.listId) return "other_list";
  return null;
}

/** The sum of the known prices of a series' volumes still wanted, in cents; null when none has one. */
export function seriesPriceCents(
  volumes: readonly { priceCents: number | null; status: string }[],
): number | null {
  const priced = volumes.filter((volume) => volume.status === "open" && volume.priceCents !== null);
  if (priced.length === 0) return null;
  return priced.reduce((total, volume) => total + (volume.priceCents ?? 0), 0);
}
