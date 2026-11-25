import { describe, expect, it } from "vitest";

import { completion, MAX_FOUND_CENTS, REFRESH_SPACING_MS, refreshSchedule } from "./enrichment.js";

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

describe("completion when the link is read again", () => {
  const read = { ...item, title: "Lampe", priceCents: 4990, foundTitle: "Lampe", foundPriceCents: 4990 };

  it("follows the page while the item still has what the page gave", () => {
    expect(completion(read, { title: "Lampe en laiton", priceCents: 3990 })).toEqual({
      title: "Lampe en laiton",
      priceCents: 3990,
    });
  });

  it("keeps a title or a price the owner changed since", () => {
    expect(
      completion(
        { ...read, title: "La lampe de Léa", priceCents: 3000 },
        { title: "Lampe 2", priceCents: 3990 },
      ),
    ).toEqual({});
  });

  it("writes nothing when the page says the same, or no longer says it", () => {
    expect(completion(read, { title: "Lampe", priceCents: 4990 })).toEqual({});
    expect(completion(read, {})).toEqual({});
  });

  it("only follows a price the page gave", () => {
    expect(completion({ ...read, foundPriceCents: null }, { priceCents: 3990 })).toEqual({});
  });
});

describe("refreshSchedule", () => {
  const now = new Date("2026-11-25T12:00:00Z");
  it("spaces the items of a same site and lets different sites go together", () => {
    const schedule = refreshSchedule(
      [
        { id: "a", url: "https://www.amazon.fr/dp/1" },
        { id: "b", url: "https://amazon.fr/dp/2" },
        { id: "c", url: "https://fnac.com/x" },
        { id: "d", url: null },
        { id: "e", url: "https://www.amazon.fr/dp/3" },
        { id: "f", url: "not a link" },
      ],
      now,
    );
    expect([...schedule.keys()]).toEqual(["a", "b", "c", "e", "f"]);
    expect(schedule.get("a")).toEqual(now);
    expect(schedule.get("b")?.getTime()).toBe(now.getTime() + REFRESH_SPACING_MS);
    expect(schedule.get("c")).toEqual(now);
    expect(schedule.get("e")?.getTime()).toBe(now.getTime() + 2 * REFRESH_SPACING_MS);
    expect(schedule.get("f")).toEqual(now);
  });
});
