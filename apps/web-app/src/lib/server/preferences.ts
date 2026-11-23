import type { Cookies } from "@sveltejs/kit";
import { parseModeChoice, parseThemeChoice, type ModeChoice, type ThemeChoice } from "@wishalia/domain";

/**
 * The person's theme and mode, kept on the device (docs/branding.md, "Theme settings"). They are
 * not secret: SameSite=Lax cookies the server reads to render the page in the right colours
 * at once, without a flash.
 */
export const THEME_COOKIE = "wishalia.theme";
export const MODE_COOKIE = "wishalia.mode";
const ONE_YEAR = 365 * 24 * 3600;

export function readPreferences(cookies: Cookies): { themeChoice: ThemeChoice; mode: ModeChoice } {
  return {
    themeChoice: parseThemeChoice(cookies.get(THEME_COOKIE)),
    mode: parseModeChoice(cookies.get(MODE_COOKIE)),
  };
}

export function writePreference(cookies: Cookies, name: string, value: string, secure: boolean): void {
  cookies.set(name, value, { path: "/", maxAge: ONE_YEAR, sameSite: "lax", httpOnly: true, secure });
}
