import type { ListIcon } from "@wishalia/domain";

/**
 * The drawings of the lists' icons (docs/list-pictures.md), on a 24 px grid, stroked as the logo
 * is coloured: the lines in the colour of its heads, a detail in the gift's red and, here and
 * there, the ribbon's gold. Each theme and mode has its own three colours (docs/branding.md), so
 * every icon follows them without a variant of its own.
 */
export type Tone = "line" | "accent" | "gold";
export type Stroke = readonly [Tone, string];

export const LIST_ICON_DRAWINGS: Record<ListIcon, readonly Stroke[]> = {
  gift: [
    ["line", "M4.5 11h15v9h-15z"],
    ["line", "M3.5 7.5h17V11h-17z"],
    ["accent", "M12 7.5V20"],
    ["accent", "M12 7.5C10.5 4.5 7 4 7 6s3 1.5 5 1.5c2 0 5 .5 5-1.5s-3.5-1.5-5 1.5"],
  ],
  tree: [
    ["line", "M12 3.5L5.5 11H9l-4.5 6h15L15 11h3.5z"],
    ["line", "M12 17v3.5M9.5 20.5h5"],
    ["accent", "M10 14.5h.01M13.5 12.5h.01M14.5 15.5h.01M11.5 9.5h.01"],
    ["gold", "M12 1.5v.01"],
  ],
  bauble: [
    ["line", "M5 14a7 7 0 1 0 14 0 7 7 0 1 0-14 0"],
    ["gold", "M10 7V4.5h4V7"],
    ["line", "M12 4.5V2.5"],
    ["accent", "M5.6 12.5c4 1.6 8.8 1.6 12.8 0M6.2 17c3.8 1.3 7.8 1.3 11.6 0"],
  ],
  snowflake: [
    ["line", "M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9"],
    ["accent", "M9.5 4.5L12 6l2.5-1.5M9.5 19.5L12 18l2.5 1.5"],
    ["accent", "M4.5 10.5l2.5-1.5-.1-2.9M19.5 13.5L17 15l.1 2.9"],
  ],
  star: [
    ["line", "M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z"],
    ["accent", "M20 2.5v3M18.5 4h3"],
  ],
  heart: [
    ["accent", "M12 20s-7.5-4.6-8.7-9.4A4.6 4.6 0 0 1 12 7a4.6 4.6 0 0 1 8.7 3.6C19.5 15.4 12 20 12 20z"],
    ["line", "M7 10.5a2.2 2.2 0 0 1 1.8-1.8"],
  ],
  cake: [
    ["line", "M3.5 20.5h17M5 20.5V14h14v6.5"],
    ["accent", "M5 16.5c1.2 1 2.3 1 3.5 0s2.3-1 3.5 0 2.3 1 3.5 0 2.3-1 3.5 0"],
    ["line", "M12 14v-3.5"],
    ["gold", "M12 8c-.9-.9-.9-2 0-3.3.9 1.3.9 2.4 0 3.3z"],
  ],
  baby: [
    ["line", "M3 10.5h15a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5z"],
    ["accent", "M3 10.5a7.5 7.5 0 0 1 7.5-7.5v7.5"],
    ["line", "M18 10.5l1.8-4H21.5"],
    ["line", "M6 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0M13 19a1.5 1.5 0 1 0 3 0 1.5 1.5 0 1 0-3 0"],
  ],
  ring: [
    ["line", "M5.5 14.5a6.5 6.5 0 1 0 13 0 6.5 6.5 0 1 0-13 0"],
    ["accent", "M9.5 5.5L12 8.8l2.5-3.3-1-2h-3z"],
    ["gold", "M9.5 5.5h5"],
  ],
  house: [
    ["line", "M3.5 11.5L12 4l8.5 7.5"],
    ["line", "M6 9.5V20h12V9.5"],
    ["accent", "M10 20v-5h4v5"],
  ],
  book: [
    ["line", "M12 6.5C10 5 7 4.5 3.5 5v13.5c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5z"],
    ["line", "M12 6.5V20"],
    ["accent", "M15.5 5v5l1.5-1 1.5 1V4.8"],
  ],
  game: [
    [
      "line",
      "M7.5 8h9a4 4 0 0 1 4 3.6l.4 4.3a2.4 2.4 0 0 1-4.3 1.6L15 16H9l-1.6 1.5a2.4 2.4 0 0 1-4.3-1.6l.4-4.3A4 4 0 0 1 7.5 8z",
    ],
    ["line", "M8 10.5v3M6.5 12h3"],
    ["accent", "M15.5 11h.01M17.5 13h.01"],
  ],
  music: [
    ["line", "M9 18V5.5l11-2V16"],
    ["accent", "M3 18a3 3 0 1 0 6 0 3 3 0 1 0-6 0M14 16a3 3 0 1 0 6 0 3 3 0 1 0-6 0"],
  ],
  travel: [
    ["line", "M4 8h16v11.5H4z"],
    ["line", "M9 8V5h6v3"],
    ["accent", "M8 8v11.5M16 8v11.5"],
  ],
  sport: [
    ["line", "M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0"],
    ["line", "M12 3v18M3 12h18"],
    ["accent", "M5.6 5.6c3.5 3.5 3.5 9.3 0 12.8M18.4 5.6c-3.5 3.5-3.5 9.3 0 12.8"],
  ],
  paw: [
    ["accent", "M7.5 17.5c0-2.8 2-5 4.5-5s4.5 2.2 4.5 5c0 1.8-1.8 2.7-4.5 2.7s-4.5-.9-4.5-2.7z"],
    [
      "line",
      "M4.4 11a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M7.9 7a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M12.9 7a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0M16.4 11a1.6 1.6 0 1 0 3.2 0 1.6 1.6 0 1 0-3.2 0",
    ],
  ],
};
