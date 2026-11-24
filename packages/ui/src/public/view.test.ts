import { describe, expect, it } from "vitest";

import type { Funding, PublicItem } from "./types.ts";
import {
  canGive,
  formatDay,
  formatEuros,
  gauge,
  gaugeLine,
  giveError,
  giveLabel,
  givers,
  heading,
  initials,
  joinNames,
  myGiftLine,
  poolBar,
  sortForGuests,
  standing,
  unitsLeft,
  withdrawError,
} from "./view.ts";

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
      "130 € réunis sur 120 € : objectif atteint, 10 € en excédent.",
    );
    expect(pool({ totalCents: 2000 }, null)).toBe("20 € réunis.");
  });
});

describe("giving helpers", () => {
  const event = { id: "e", name: "Noël", kind: "christmas" as const, date: "2026-12-24", open: true };

  it("counts the copies left", () => {
    expect(unitsLeft(item({ kind: "pool" }))).toBe(0);
    expect(unitsLeft(item())).toBe(1);
    expect(unitsLeft(item({ funding: funding({ reservedUnits: 1 }) }))).toBe(0);
    expect(unitsLeft(item({ kind: "quantity", quantity: 4, funding: funding({ reservedUnits: 1 }) }))).toBe(
      3,
    );
    expect(unitsLeft(item({ repeatable: true, funding: funding({ reservedUnits: 3 }) }))).toBe(1);
  });

  it("offers to give only what a guest can still give", () => {
    const guest = { viewer: "guest", event: null };
    expect(canGive(item(), guest)).toBe(true);
    expect(canGive(item({ kind: "pool", funding: funding({ state: "complete" }) }), guest)).toBe(true);
    expect(canGive(item(), { viewer: "owner", event: null })).toBe(false);
    expect(canGive(item({ status: "received" }), guest)).toBe(false);
    expect(canGive(item({ funding: funding({ reservedUnits: 1 }) }), guest)).toBe(false);
    expect(canGive(item(), { viewer: "guest", event: { ...event, open: false } })).toBe(false);
  });

  it("names the button after the item", () => {
    expect(giveLabel(item({ kind: "pool" }))).toBe("Je participe");
    expect(giveLabel(item())).toBe("Je le réserve");
    expect(giveLabel(item({ kind: "quantity", quantity: 3 }))).toBe("J'en réserve");
  });

  it("says what went wrong in plain words", () => {
    expect(giveError("already_reserved")).toContain("vient de le réserver");
    expect(giveError("weird")).toContain("Réessayez");
    expect(withdrawError("event_closed")).toContain("passée");
    expect(withdrawError("weird")).toContain("Réessayez");
  });

  it("tells the person what they gave", () => {
    const gift = { id: "g", itemId: "i", eventId: null, amountCents: null, units: null };
    expect(plain(myGiftLine({ ...gift, amountCents: 2000 }, item({ kind: "pool" })))).toBe(
      "Vous participez pour 20 €.",
    );
    expect(myGiftLine({ ...gift, units: 1 }, item({ kind: "quantity" }))).toBe("Vous en réservez un.");
    expect(myGiftLine({ ...gift, units: 2 }, item({ kind: "quantity" }))).toBe("Vous en réservez 2.");
    expect(myGiftLine({ ...gift, units: 1 }, item())).toBe("Vous l'avez réservé.");
  });
});

describe("the drawings", () => {
  const noel = { id: "noel", name: "Noël", kind: "christmas" as const, date: "2026-12-24", open: true };
  const pool = (patch: Partial<Funding>, targetCents: number | null = 10000) =>
    item({ kind: "pool", targetCents, funding: funding({ totalCents: 0, ...patch }) });

  it("draws a pool's bar per event, on the scale of the target, with the overshoot past it", () => {
    const bar = poolBar(
      pool({
        totalCents: 6000,
        byEvent: [
          { eventId: "noel", amountCents: 4000 },
          { eventId: null, amountCents: 1500 },
          { eventId: "elsewhere", amountCents: 500 },
        ],
      }),
      [noel],
    );
    expect(bar?.segments.map(({ label, start, width, tone }) => [label, start, width, tone])).toEqual([
      ["Noël", 0, 0.4, 0],
      ["Sans occasion", 0.4, 0.15, 1],
      ["Une autre occasion", 0.55, 0.05, 2],
    ]);
    expect(bar?.target).toBe(1);
    expect(bar?.overshoot).toBeNull();

    const over = poolBar(pool({ totalCents: 12500, byEvent: [{ eventId: "noel", amountCents: 12500 }] }), [
      noel,
    ]);
    expect(over?.target).toBe(0.8);
    expect(over?.overshoot).toEqual({ start: 0.8, width: expect.closeTo(0.2) });
    expect(over?.segments[0]?.width).toBe(1);
  });

  it("draws nothing when there is nothing to draw, or nothing to see", () => {
    expect(poolBar(pool({ totalCents: 0 }, null), [])).toBeNull();
    expect(poolBar(item({ kind: "pool", targetCents: 100, funding: null }), [])).toBeNull();
    expect(poolBar(item(), [])).toBeNull();
    // Without a split, the whole total is one segment; without a target, no mark
    const plainBar = poolBar(pool({ totalCents: 3000 }, null), []);
    expect(plainBar?.segments).toHaveLength(1);
    expect(plainBar?.target).toBeNull();
  });

  it("counts where an event stands, received items as complete, hidden ones not at all", () => {
    const items = [
      item({ funding: funding({ state: "complete" }) }),
      item({ status: "received", funding: null }),
      item({ funding: funding({ state: "almost" }) }),
      item({ funding: funding({ state: "in_progress" }) }),
      item(),
      item({ funding: null }),
    ];
    const result = gauge(items);
    expect(result).toEqual({ complete: 2, inProgress: 2, free: 1 });
    expect(gaugeLine(result ?? { complete: 0, inProgress: 0, free: 0 })).toBe(
      "2 complets, 2 en cours, 1 libre.",
    );
    expect(gauge([item({ funding: null })])).toBeNull();
  });

  it("gives an avatar one or two letters", () => {
    expect(initials("Paul")).toBe("P");
    expect(initials("jean-pierre dupont")).toBe("JP");
    expect(initials("Élise Martin")).toBe("ÉM");
    expect(initials("Camille (exemple)")).toBe("C");
    expect(initials("(42)")).toBe("?");
    expect(initials(null)).toBe("?");
  });
});
