/**
 * The languages of Wishalia (docs/i18n.md). French is the source language: every word is written
 * in French first, and each other language gives the same keys (checked by the type checker and by
 * catalog.test.ts). Adding a language: its code here, its name in LOCALE_NAMES, one file per
 * catalog under messages/.
 */

export const LOCALES = ["fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];

/** A person's choice: a language, or « automatic » (the browser's language). */
export type LocaleChoice = "auto" | Locale;
export const LOCALE_CHOICES: readonly LocaleChoice[] = ["auto", ...LOCALES];

/** Each language in its own words, so that anyone finds theirs in the list. */
export const LOCALE_NAMES: Record<Locale, string> = { fr: "Français", en: "English" };

/** BCP 47 tags for Intl (dates, amounts, lists of names). */
export const LOCALE_TAGS: Record<Locale, string> = { fr: "fr-FR", en: "en-GB" };

export const FALLBACK_LOCALE: Locale = "fr";

export const isLocale = (value: unknown): value is Locale => LOCALES.includes(value as Locale);

/** A stored or sent language, or null on anything unknown. */
export const parseLocale = (value: unknown): Locale | null => {
  if (typeof value !== "string") return null;
  const base = value.trim().toLowerCase().split(/[-_]/)[0];
  return isLocale(base) ? base : null;
};

export const parseLocaleChoice = (value: unknown): LocaleChoice =>
  value === "auto" ? "auto" : (parseLocale(value) ?? "auto");

/** The server's language when nothing else says: DEFAULT_LOCALE, French otherwise. */
export const defaultLocale = (value: string | undefined): Locale => parseLocale(value) ?? FALLBACK_LOCALE;

/**
 * The best language for an Accept-Language header (« en-US,en;q=0.9,fr;q=0.8 »): the first one,
 * by weight, that Wishalia speaks; the fallback otherwise.
 */
export function negotiateLocale(header: string | null | undefined, fallback: Locale): Locale {
  if (!header) return fallback;
  const ranges = header
    .split(",")
    .slice(0, 20)
    .map((part, index) => {
      const [range = "", ...params] = part.trim().split(";");
      const q = params.map((p) => p.trim()).find((p) => p.startsWith("q="));
      const weight = q ? Number(q.slice(2)) : 1;
      return { range, weight: Number.isFinite(weight) ? weight : 0, index };
    })
    .filter((entry) => entry.weight > 0 && entry.range)
    .sort((a, b) => b.weight - a.weight || a.index - b.index);
  for (const { range } of ranges) {
    const locale = parseLocale(range);
    if (locale) return locale;
  }
  return fallback;
}

/** Which language a page speaks: the person's choice, then their browser's, then the server's. */
export function resolveLocale({
  choice,
  acceptLanguage,
  fallback,
}: {
  choice: LocaleChoice | null | undefined;
  acceptLanguage: string | null | undefined;
  fallback: Locale;
}): Locale {
  if (choice && choice !== "auto") return choice;
  return negotiateLocale(acceptLanguage, fallback);
}
