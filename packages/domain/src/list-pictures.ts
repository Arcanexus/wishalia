/**
 * The picture of a list (docs/list-pictures.md): one of the icons Wishalia draws, or an image the
 * owner sends. It shows next to the list's name on the owner's screens and on the guests' pages.
 * Pure: no file, no network.
 */

/**
 * The icons a list may take, in the order the picker shows them: the occasions of a family year
 * first, then the things lists are often about. Drawn by @wishalia/ui in the theme's colours.
 */
export const LIST_ICONS = [
  "gift",
  "tree",
  "bauble",
  "snowflake",
  "star",
  "heart",
  "cake",
  "baby",
  "ring",
  "house",
  "book",
  "game",
  "music",
  "travel",
  "sport",
  "paw",
] as const;
export type ListIcon = (typeof LIST_ICONS)[number];

/** What a list without a choice shows: a gift, as the logo. */
export const DEFAULT_LIST_ICON: ListIcon = "gift";

/** Whether a stored or sent value is one of the icons. */
export function isListIcon(value: unknown): value is ListIcon {
  return typeof value === "string" && (LIST_ICONS as readonly string[]).includes(value);
}

/** Where the owner's images of lists are stored: one file per list, under its id. */
export const LIST_IMAGE_PREFIX = "lists/";

/** The key of a new image of a list; `unique` keeps every upload apart (a cache never mixes them). */
export function listImageKey(listId: string, unique: string): string {
  return `${LIST_IMAGE_PREFIX}${listId}/${unique}`;
}

/** What a list shows: the owner's image while it has one, otherwise its icon (or the default one). */
export type ListPicture<Image> = { kind: "image"; image: Image } | { kind: "icon"; icon: ListIcon };

export function listPicture<Image>(list: { icon: string | null; image: Image | null }): ListPicture<Image> {
  if (list.image) return { kind: "image", image: list.image };
  return { kind: "icon", icon: isListIcon(list.icon) ? list.icon : DEFAULT_LIST_ICON };
}
