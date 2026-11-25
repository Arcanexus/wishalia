/**
 * Open links and the home page's search (« Trouver une liste »): pure rules. An open link is a
 * share link for anyone who has the address; the owner chooses it, and chooses whether the search
 * shows it. Nothing else is ever searchable.
 */

/** The longest search the home page takes, in characters. */
export const MAX_SEARCH_LENGTH = 80;
/** The shortest: one letter would list everything. */
export const MIN_SEARCH_LENGTH = 2;
/** The most results the search gives at once. */
export const MAX_SEARCH_RESULTS = 24;

/** Lower case, without accents or extra spaces: « Léa  Martin » and « lea martin » match. */
export function normalizeSearch(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/**
 * The words of a search, or null when there is nothing to search (too short once cleaned). Past
 * MAX_SEARCH_LENGTH the rest is dropped.
 */
export function searchWords(query: string): string[] | null {
  const cleaned = normalizeSearch(query.slice(0, MAX_SEARCH_LENGTH));
  if (cleaned.replace(/ /g, "").length < MIN_SEARCH_LENGTH) return null;
  return cleaned.split(" ");
}

/** Whether every word of the search starts a word of the fields (the owner's name, the title). */
export function matchesSearch(words: readonly string[], fields: readonly string[]): boolean {
  const known = fields.flatMap((field) => normalizeSearch(field).split(" ")).filter(Boolean);
  return words.every((word) => known.some((candidate) => candidate.startsWith(word)));
}

/**
 * The name a guest sees for another person's gift. On an open link anyone may be looking, so the
 * family's names stay out of it: only the person's own gifts are named. On a link per guest or
 * group, the name shows unless the giver stayed discreet.
 */
export function giverNameShown(input: {
  openLink: boolean;
  anonymous: boolean;
  mine: boolean;
  name: string | null;
}): string | null {
  if (input.anonymous) return null;
  if (input.openLink && !input.mine) return null;
  return input.name;
}
