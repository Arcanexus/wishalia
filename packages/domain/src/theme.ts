/**
 * Which theme a page is shown in (docs/branding.md, "Theme settings"). From the strongest: the
 * theme the list forces, then the person's theme, then Automatic. The light or dark mode always
 * stays personal, so nobody loses the contrast they need.
 */

export type ThemeName = "neutral" | "christmas";
export type ThemeChoice = "auto" | ThemeName;
export type ModeChoice = "device" | "light" | "dark";

export const THEME_CHOICES: readonly ThemeChoice[] = ["auto", "neutral", "christmas"];
export const MODE_CHOICES: readonly ModeChoice[] = ["device", "light", "dark"];

export interface ThemeContext {
  /** The theme the list forces on everyone, if any. */
  listTheme?: ThemeName | null;
  /** Whether the page shows a Christmas list (a list in a Christmas event). */
  christmasList?: boolean;
  /** The person's own choice. */
  personTheme: ThemeChoice;
  /** Today, in the person's time zone or the server's. */
  today: Date;
}

/** Automatic: Christmas for a Christmas list, or in December; neutral otherwise. */
export function resolveTheme({
  listTheme,
  christmasList = false,
  personTheme,
  today,
}: ThemeContext): ThemeName {
  if (listTheme) return listTheme;
  if (personTheme !== "auto") return personTheme;
  return christmasList || today.getUTCMonth() === 11 ? "christmas" : "neutral";
}

/** Reads a stored choice, falling back to the default on anything unknown. */
export function parseThemeChoice(value: unknown): ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice) ? (value as ThemeChoice) : "auto";
}

export function parseModeChoice(value: unknown): ModeChoice {
  return MODE_CHOICES.includes(value as ModeChoice) ? (value as ModeChoice) : "device";
}

/** The header button: device, then light, then dark, then device again. */
export function nextMode(mode: ModeChoice): ModeChoice {
  return MODE_CHOICES[(MODE_CHOICES.indexOf(mode) + 1) % MODE_CHOICES.length] ?? "device";
}
