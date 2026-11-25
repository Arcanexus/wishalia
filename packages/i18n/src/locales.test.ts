import { describe, expect, it } from "vitest";

import { formatters } from "./format.js";
import { defaultLocale, negotiateLocale, parseLocale, parseLocaleChoice, resolveLocale } from "./locales.js";

describe("locales", () => {
  it("reads a language code, whatever its region or case", () => {
    expect(parseLocale("fr")).toBe("fr");
    expect(parseLocale("en-US")).toBe("en");
    expect(parseLocale("EN_gb")).toBe("en");
    expect(parseLocale("de")).toBeNull();
    expect(parseLocale(42)).toBeNull();
    expect(parseLocaleChoice("auto")).toBe("auto");
    expect(parseLocaleChoice("en")).toBe("en");
    expect(parseLocaleChoice("xx")).toBe("auto");
    expect(parseLocaleChoice(undefined)).toBe("auto");
  });

  it("falls back to French for an unknown server default", () => {
    expect(defaultLocale(undefined)).toBe("fr");
    expect(defaultLocale("en")).toBe("en");
    expect(defaultLocale("klingon")).toBe("fr");
  });

  it("picks the browser's best language that Wishalia speaks", () => {
    expect(negotiateLocale("en-US,en;q=0.9,fr;q=0.8", "fr")).toBe("en");
    expect(negotiateLocale("de-DE,de;q=0.9,fr;q=0.5,en;q=0.7", "fr")).toBe("en");
    expect(negotiateLocale("de, it", "en")).toBe("en");
    expect(negotiateLocale("en;q=0, fr", "en")).toBe("fr");
    expect(negotiateLocale("en;q=abc, fr;q=0.1", "en")).toBe("fr");
    expect(negotiateLocale("*", "fr")).toBe("fr");
    expect(negotiateLocale("", "en")).toBe("en");
    expect(negotiateLocale(null, "fr")).toBe("fr");
  });

  it("puts the person's choice before their browser's", () => {
    expect(resolveLocale({ choice: "fr", acceptLanguage: "en", fallback: "en" })).toBe("fr");
    expect(resolveLocale({ choice: "auto", acceptLanguage: "en", fallback: "fr" })).toBe("en");
    expect(resolveLocale({ choice: null, acceptLanguage: null, fallback: "en" })).toBe("en");
  });
});

describe("formatters", () => {
  // Intl separates the French thousands and the euro sign with narrow no-break spaces
  const plain = (text: string) => text.replace(/\s/g, " ");

  it("writes amounts, days and names in French", () => {
    const f = formatters("fr");
    expect(plain(f.money(4990))).toBe("49,90 €");
    expect(plain(f.money(12000))).toBe("120 €");
    expect(f.amount(1250)).toBe("12,50");
    expect(f.amount(123400)).toBe("1234");
    expect(f.day("2026-12-24")).toBe("jeudi 24 décembre 2026");
    expect(f.date("2026-12-24T10:00:00Z")).toBe("24 décembre 2026");
    expect(f.list(["Paul", "Jeanne", "Léa"])).toBe("Paul, Jeanne et Léa");
    expect(plain(f.number(1200))).toBe("1 200");
    expect(f.upper("é")).toBe("É");
    expect(f.dateTime("2026-12-24T10:00:00Z")).toContain("2026");
    expect(f.tag).toBe("fr-FR");
  });

  it("writes them in English, and keeps one set per language", () => {
    const f = formatters("en");
    expect(f.money(4990)).toBe("€49.90");
    expect(f.amount(123450)).toBe("1234.50");
    expect(f.day("2026-12-24")).toBe("Thursday, 24 December 2026");
    expect(f.date(new Date("2026-12-24T10:00:00Z"))).toBe("24 December 2026");
    expect(f.list(["Paul", "Jeanne"])).toBe("Paul and Jeanne");
    expect(f.number(1200)).toBe("1,200");
    expect(formatters("en")).toBe(f);
  });
});
