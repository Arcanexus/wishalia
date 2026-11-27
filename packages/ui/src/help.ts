import type { CommonMessages } from "@wishalia/i18n/messages/common";

/** A part of the user guide the help menu and the « ? » of a setting lead to (docs/user-guide.md). */
export type HelpTopic = keyof CommonMessages["help"]["topics"];

/**
 * The anchor a wiki gives a heading, as GitHub makes it: in lower case, without punctuation, each
 * space a hyphen (« La règle d'or : la surprise » → « la-règle-dor--la-surprise »).
 */
export function headingAnchor(heading: string): string {
  return heading
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .replace(/\s/g, "-");
}

/** The address of a part of the guide: the guide's own address, with that heading's anchor. */
export function topicUrl(guide: string, heading: string): string {
  const url = URL.parse(guide);
  if (!url) return guide;
  url.hash = headingAnchor(heading);
  return url.href;
}
