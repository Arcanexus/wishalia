import type { Locale } from "@wishalia/i18n";

/** The user guide on the project's wiki, in each language (docs/user-guide.md). */
export const GUIDES: Record<Locale, string> = {
  fr: "https://github.com/Arcanexus/wishalia/wiki/Guide-utilisateur",
  en: "https://github.com/Arcanexus/wishalia/wiki/User-guide",
};

/**
 * The version the foot of the pages shows: the image's (APP_VERSION, set from the release tag)
 * when it is a release number, otherwise the one the app was built from (a development build, or
 * an image of a branch).
 */
export function shownVersion(fromImage: string | undefined, built: string): string {
  const image = fromImage?.trim().replace(/^v/, "");
  return image && /^\d+\.\d+\.\d+(?:[-+][\w.-]+)?$/.test(image) ? image : built;
}

/**
 * Where « Aide » leads: HELP_URL when the server sets one (an https or http address only), the
 * project's user guide in the page's language otherwise.
 */
export function helpUrl(locale: Locale, configured: string | undefined): string {
  const url = configured?.trim() ? URL.parse(configured.trim()) : null;
  return url && (url.protocol === "https:" || url.protocol === "http:") ? url.href : GUIDES[locale];
}
