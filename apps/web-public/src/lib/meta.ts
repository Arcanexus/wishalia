/**
 * Title and Open Graph tags of the public pages. They are the same for every page on purpose:
 * a link preview in a chat must never tell the owner what was taken or funded (spec, section 3).
 * Nothing here may take a list, an item or a contribution as input: only the product and the
 * reader's language.
 */
import type { Locale } from "@wishalia/i18n";
import { publicMessages } from "@wishalia/i18n/messages/public";

export interface PageMeta {
  title: string;
  description: string;
  "og:title": string;
  "og:description": string;
  "og:type": "website";
}

export function genericMeta(appName: string, locale: Locale): PageMeta {
  const m = publicMessages(locale).meta;
  const title = m.title(appName);
  const description = m.description;
  return { title, description, "og:title": title, "og:description": description, "og:type": "website" };
}
