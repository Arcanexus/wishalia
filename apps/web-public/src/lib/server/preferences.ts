import type { Cookies } from "@sveltejs/kit";
import {
  parseModeChoice,
  parseTextSize,
  parseThemeChoice,
  type ModeChoice,
  type TextSize,
  type ThemeChoice,
} from "@wishalia/domain";
import {
  defaultLocale,
  parseLocaleChoice,
  resolveLocale,
  type Locale,
  type LocaleChoice,
} from "@wishalia/i18n";

/**
 * The person's theme and mode, kept on the device (docs/branding.md, "Theme settings"). They are
 * not secret: SameSite=Lax cookies the server reads to render the page in the right colours
 * at once, without a flash.
 */
export const THEME_COOKIE = "wishalia.theme";
export const MODE_COOKIE = "wishalia.mode";
/** The size of the text, on this device only (docs/branding.md, « Text size »). */
export const TEXT_COOKIE = "wishalia.text";
/** The language the person chose (docs/i18n.md); without it, their browser's. */
export const LOCALE_COOKIE = "wishalia.locale";
const ONE_YEAR = 365 * 24 * 3600;

export function readPreferences(cookies: Cookies): {
  themeChoice: ThemeChoice;
  mode: ModeChoice;
  textSize: TextSize;
  localeChoice: LocaleChoice;
} {
  return {
    themeChoice: parseThemeChoice(cookies.get(THEME_COOKIE)),
    mode: parseModeChoice(cookies.get(MODE_COOKIE)),
    textSize: parseTextSize(cookies.get(TEXT_COOKIE)),
    localeChoice: parseLocaleChoice(cookies.get(LOCALE_COOKIE)),
  };
}

/** The page's language: the person's choice, then their browser's, then DEFAULT_LOCALE. */
export const pageLocale = (choice: LocaleChoice, acceptLanguage: string | null): Locale =>
  resolveLocale({ choice, acceptLanguage, fallback: defaultLocale(process.env.DEFAULT_LOCALE) });

export function writePreference(cookies: Cookies, name: string, value: string, secure: boolean): void {
  cookies.set(name, value, { path: "/", maxAge: ONE_YEAR, sameSite: "lax", httpOnly: true, secure });
}

/** Back to a page of this site only: a path, never another site. */
export function safeReturnPath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
