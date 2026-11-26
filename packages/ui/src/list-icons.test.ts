import { LIST_ICONS } from "@wishalia/domain";
import { describe, expect, it } from "vitest";

import { LIST_ICON_DRAWINGS } from "./list-icons.ts";

describe("the drawings of the lists' icons", () => {
  it("draws every icon of the domain, and nothing else", () => {
    expect(Object.keys(LIST_ICON_DRAWINGS).sort()).toEqual([...LIST_ICONS].sort());
  });

  it("gives each one its lines and a coloured detail, in path commands only", () => {
    for (const icon of LIST_ICONS) {
      const strokes = LIST_ICON_DRAWINGS[icon];
      const tones = new Set(strokes.map(([tone]) => tone));
      expect(tones.has("line") && tones.has("accent"), icon).toBe(true);
      for (const [, d] of strokes) expect(d, icon).toMatch(/^M[\d\s.,MmLlHhVvCcSsAaZz-]+$/);
    }
  });

  it("stays inside its 24 px square", () => {
    for (const icon of LIST_ICONS) {
      for (const [, d] of LIST_ICON_DRAWINGS[icon]) {
        // The absolute moves give where each stroke starts
        for (const [, x, y] of d.matchAll(/M(-?[\d.]+)[ ,]?(-?[\d.]+)/g)) {
          expect(Number(x), icon).toBeGreaterThanOrEqual(0);
          expect(Number(x), icon).toBeLessThanOrEqual(24);
          expect(Number(y), icon).toBeGreaterThanOrEqual(0);
          expect(Number(y), icon).toBeLessThanOrEqual(24);
        }
      }
    }
  });
});

describe("the names of the lists' icons", () => {
  it.each(["fr", "en"] as const)("names every icon in %s, for the picker and its tips", async (locale) => {
    const { appMessages } = await import("@wishalia/i18n/messages/app");
    const names = appMessages(locale).listPicture.names;
    for (const icon of LIST_ICONS) expect(names[icon]?.trim(), `${locale}: ${icon}`).toBeTruthy();
    expect(Object.keys(names).sort()).toEqual([...LIST_ICONS].sort());
  });
});
