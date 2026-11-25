import { describe, expect, it } from "vitest";

import { LOCALES, type Locale } from "../locales.js";
import { CATALOGS } from "./all.js";

/**
 * The CI check of the translations (docs/i18n.md): every language gives every key of the French
 * source, of the same kind, and no word is left empty. The type checker already refuses a missing
 * or extra key; this test also catches a value of the wrong kind or an empty string.
 */
type Shape = string | { [key: string]: Shape };

function shape(value: unknown, path: string, problems: string[]): Shape {
  if (typeof value === "function") return `function/${value.length}`;
  if (typeof value === "string") {
    if (!value.trim()) problems.push(`${path} is empty`);
    return "string";
  }
  if (Array.isArray(value)) return `array/${value.length}`;
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, child]) => [key, shape(child, `${path}.${key}`, problems)]),
    );
  }
  return typeof value;
}

/** Every function of a catalog, with where it is. */
function functions(value: unknown, path: string): [string, (...args: unknown[]) => unknown][] {
  if (typeof value === "function") return [[path, value as (...args: unknown[]) => unknown]];
  if (value && typeof value === "object") {
    return Object.entries(value).flatMap(([key, child]) => functions(child, `${path}.${key}`));
  }
  return [];
}

/** Sample arguments: counts for the plurals, then words, then nothing at all. */
const SAMPLES: unknown[] = [0, 1, 2, 12, "Léa", true, false, null];

describe.each(Object.entries(CATALOGS))("the %s catalog", (_area, byLocale) => {
  const problems: string[] = [];
  const source = shape(byLocale("fr"), "fr", problems);

  it.each(LOCALES.filter((locale) => locale !== "fr"))("has every French key in %s", (locale: Locale) => {
    const localeProblems: string[] = [];
    expect(shape(byLocale(locale), locale, localeProblems)).toEqual(source);
    expect(localeProblems).toEqual([]);
  });

  it("leaves no French word empty", () => {
    expect(problems).toEqual([]);
  });

  it.each(LOCALES)("writes a sentence in %s for any count or name", (locale: Locale) => {
    const empty: string[] = [];
    for (const [path, write] of functions(byLocale(locale), locale)) {
      for (const sample of SAMPLES) {
        const text = write(...Array.from({ length: Math.max(1, write.length) }, () => sample));
        if (typeof text !== "string" || !text.trim()) empty.push(`${path}(${String(sample)})`);
      }
    }
    expect(empty).toEqual([]);
  });
});
