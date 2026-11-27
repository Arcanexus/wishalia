import { describe, expect, it } from "vitest";

import {
  displayChange,
  nextMode,
  parseModeChoice,
  parseTextSize,
  parseThemeChoice,
  resolveTheme,
} from "./theme.js";

const june = new Date("2026-06-15T12:00:00Z");
const december = new Date("2026-12-05T12:00:00Z");

describe("resolveTheme", () => {
  it("lets the list's forced theme win over everything", () => {
    expect(resolveTheme({ listTheme: "neutral", personTheme: "christmas", today: december })).toBe("neutral");
    expect(resolveTheme({ listTheme: "christmas", personTheme: "neutral", today: june })).toBe("christmas");
  });

  it("then the person's own theme", () => {
    expect(resolveTheme({ personTheme: "neutral", today: december, christmasList: true })).toBe("neutral");
    expect(resolveTheme({ listTheme: null, personTheme: "christmas", today: june })).toBe("christmas");
  });

  it("is Christmas in December or for a Christmas list when automatic, neutral otherwise", () => {
    expect(resolveTheme({ personTheme: "auto", today: december })).toBe("christmas");
    expect(resolveTheme({ personTheme: "auto", today: june, christmasList: true })).toBe("christmas");
    expect(resolveTheme({ personTheme: "auto", today: june })).toBe("neutral");
  });
});

describe("choices", () => {
  it("falls back to the defaults on anything unknown", () => {
    expect(parseThemeChoice("christmas")).toBe("christmas");
    expect(parseThemeChoice("pink")).toBe("auto");
    expect(parseModeChoice("dark")).toBe("dark");
    expect(parseModeChoice(undefined)).toBe("device");
  });

  it("cycles the mode from the header button", () => {
    expect(nextMode("device")).toBe("light");
    expect(nextMode("light")).toBe("dark");
    expect(nextMode("dark")).toBe("device");
  });
});

describe("displayChange", () => {
  it("takes the mode or the theme the menu names", () => {
    expect(displayChange("device", { mode: "dark" })).toEqual({ mode: "dark" });
    expect(displayChange("device", { theme: "christmas" })).toEqual({ theme: "christmas" });
    expect(displayChange("device", { text: "larger" })).toEqual({ text: "larger" });
  });

  it("moves on to the next mode when nothing known is named", () => {
    expect(displayChange("light", {})).toEqual({ mode: "dark" });
    expect(displayChange("dark", { mode: "pink", theme: "neon" })).toEqual({ mode: "device" });
  });
});

describe("parseTextSize", () => {
  it("keeps a known size and falls back to the normal one", () => {
    expect(parseTextSize("large")).toBe("large");
    expect(parseTextSize("larger")).toBe("larger");
    expect(parseTextSize("huge")).toBe("normal");
    expect(parseTextSize(undefined)).toBe("normal");
  });
});
