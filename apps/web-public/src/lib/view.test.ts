import { describe, expect, it } from "vitest";

import type { Funding, PublicItem } from "./types.ts";
import { formatDay, formatEuros, givers, heading, joinNames, sortForGuests, standing } from "./view.ts";

const funding = (patch: Partial<Funding> = {}): Funding => ({
  state: "free",
  progress: 0,
  contributors: [],
  ...patch,
});

const item = (patch: Partial<PublicItem> = {}): PublicItem => ({
  id: "i",
  kind: "unique",
  repeatable: false,
  title: "Lampe",
  url: null,
  notes: null,
  priceCents: null,
  targetCents: null,
  quantity: null,
  status: "open",
  eventIds: [],
  funding: funding(),
  ...patch,
});

/** Intl writes narrow and no-break spaces: compared as plain spaces. */
const plain = (text: string | null) => text?.replace(/[\u00a0\u202f]/g, " ") ?? null;

describe("sortForGuests", () => {
  it("puts what is still to give first, in the owner's order, then complete, then received", () => {
    const items = [
      item({ id: "received", status: "received" }),
      item({ id: "full", funding: funding({ state: "complete" }) }),
      item({ id: "a" }),
      item({ id: "hidden", funding: null }),
      item({ id: "b", funding: funding({ state: "almost" }) }),
    ];
    expect(sortForGuests(items).map((entry) => entry.id)).toEqual(["a", "hidden", "b", "full", "received"]);
  });
});

describe("words", () => {
  it("writes amounts and days the French way", () => {
    expect(plain(formatEuros(12000))).toBe("120 €");
    expect(plain(formatEuros(4990))).toBe("49,90 €");
    expect(formatDay("2026-12-24")).toBe("jeudi 24 décembre 2026");
  });

  it("joins names", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Paul"])).toBe("Paul");
    expect(joinNames(["Paul", "Jeanne", "Léa"])).toBe("Paul, Jeanne et Léa");
  });

  it("names the givers once each, and counts the anonymous ones", () => {
    const contributors = [
      { name: "Paul", mine: false },
      { name: "Paul", mine: false },
      { name: null, mine: false },
    ];
    expect(givers(funding({ contributors }))).toBe("Paul et une personne discrète");
    expect(
      givers(
        funding({
          contributors: [
            { name: null, mine: false },
            { name: null, mine: false },
          ],
        }),
      ),
    ).toBe("2 personnes discrètes");
  });

  it("titles the page after the event, else the list", () => {
    const event = { id: "e", name: "Noël", kind: "christmas" as const, date: "2026-12-24", open: true };
    expect(heading({ list: null, event })).toBe("Noël");
    expect(heading({ list: { name: "Mes envies" }, event: null })).toBe("Mes envies");
    expect(heading({ list: null, event: null })).toBe("Liste de souhaits");
  });
});

describe("standing", () => {
  const paul = [{ name: "Paul", mine: false }];

  it("says nothing without funding, and thanks for a received item", () => {
    expect(standing(item({ funding: null }))).toBeNull();
    expect(standing(item({ status: "received", funding: null }))).toBe("Déjà reçu : merci !");
  });

  it("tells a unique item free or reserved", () => {
    expect(standing(item())).toBe("Libre.");
    expect(standing(item({ funding: funding({ state: "complete", contributors: paul }) }))).toBe(
      "Réservé par Paul.",
    );
    expect(standing(item({ funding: funding({ state: "complete" }) }))).toBe("Déjà réservé.");
  });

  it("counts the times a repeatable item was given", () => {
    expect(standing(item({ repeatable: true }))).toBe("Libre, et peut être offert à chaque occasion.");
    expect(standing(item({ repeatable: true, funding: funding({ timesGiven: 1 }) }))).toContain("une fois");
    expect(standing(item({ repeatable: true, funding: funding({ timesGiven: 3 }) }))).toContain("3 fois");
  });

  it("counts the copies of a quantity item", () => {
    const copies = (reservedUnits: number, quantity = 5, contributors = paul) =>
      standing(item({ kind: "quantity", quantity, funding: funding({ reservedUnits, contributors }) }));
    expect(copies(0, 5, [])).toBe("5 à offrir, aucun réservé pour l'instant.");
    expect(copies(0, 1, [])).toBe("Libre.");
    expect(copies(1)).toBe("1 sur 5 déjà réservé, par Paul.");
    expect(copies(2, 5, [])).toBe("2 sur 5 déjà réservés.");
    expect(copies(5)).toBe("Tout est réservé, par Paul.");
    expect(copies(5, 5, [])).toBe("Tout est réservé.");
  });

  it("tells where a pool stands", () => {
    const pool = (patch: Partial<Funding>, targetCents: number | null = 12000) =>
      plain(standing(item({ kind: "pool", targetCents, funding: funding(patch) })));
    expect(pool({ totalCents: 0 })).toBe("Cagnotte de 120 €, à lancer.");
    expect(pool({ totalCents: 0 }, null)).toBe("Cagnotte à lancer.");
    expect(pool({ totalCents: 4500, remainingCents: 7500, contributors: paul })).toBe(
      "45 € réunis sur 120 € : il manque 75 €, avec Paul.",
    );
    expect(pool({ totalCents: 13000, remainingCents: 0, overshootCents: 1000 })).toBe(
      "130 € réunis sur 120 € : objectif dépassé de 10 €.",
    );
    expect(pool({ totalCents: 2000 }, null)).toBe("20 € réunis.");
  });
});
