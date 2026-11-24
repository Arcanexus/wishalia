import { describe, expect, it } from "vitest";

import { completion, MAX_FOUND_CENTS } from "./enrichment.js";

const item = { title: "example.com", url: "https://www.example.com/lampe", priceCents: null };

describe("completion", () => {
  it("replaces the placeholder title and fills an empty price", () => {
    expect(completion(item, { title: "  Lampe   en laiton ", priceCents: 4990, currency: "EUR" })).toEqual({
      title: "Lampe en laiton",
      priceCents: 4990,
    });
  });

  it("never overwrites what the owner wrote", () => {
    expect(
      completion(
        { ...item, title: "La lampe de Léa", priceCents: 3000 },
        { title: "Lampe", priceCents: 4990 },
      ),
    ).toEqual({});
  });

  it("leaves out a price in another currency, or one that makes no sense", () => {
    for (const found of [
      { priceCents: 4990, currency: "USD" },
      { priceCents: 0 },
      { priceCents: -5 },
      { priceCents: 12.5 },
      { priceCents: MAX_FOUND_CENTS + 1 },
      { priceCents: null },
    ]) {
      expect(completion(item, found)).toEqual({});
    }
  });

  it("does nothing without a link, a title, or with the same title", () => {
    expect(completion({ ...item, url: null }, { title: "Lampe" })).toEqual({});
    expect(completion(item, { title: "   " })).toEqual({});
    expect(completion(item, { title: "example.com" })).toEqual({});
    expect(completion(item, { title: "x".repeat(400) }).title).toHaveLength(300);
  });
});
