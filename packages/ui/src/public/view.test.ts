import { describe, expect, it } from "vitest";

import type { Funding, PublicItem } from "./types.ts";
import * as view from "./view.ts";

const { canGive, gauge, sortForGuests, unitsLeft } = view;

// The French words: the source language (packages/i18n). English is checked at the end
const formatDay = (date: string) => view.formatDay(date, "fr");
const formatEuros = (cents: number) => view.formatEuros(cents, "fr");
const gaugeLine = (value: view.Gauge) => view.gaugeLine(value, "fr");
const giveError = (code: string) => view.giveError(code, "fr");
const giveLabel = (entry: PublicItem) => view.giveLabel(entry, "fr");
const givers = (value: Funding) => view.givers(value, "fr");
const heading = (value: Parameters<typeof view.heading>[0]) => view.heading(value, "fr");
const initials = (name: string | null) => view.initials(name, "fr");
const joinNames = (names: string[]) => view.joinNames(names, "fr");
const myGiftLine = (gift: Parameters<typeof view.myGiftLine>[0], entry: PublicItem) =>
  view.myGiftLine(gift, entry, "fr");
const poolBar = (entry: PublicItem, events: Parameters<typeof view.poolBar>[1]) =>
  view.poolBar(entry, events, "fr");
const standing = (entry: PublicItem) => view.standing(entry, "fr");
const withdrawError = (code: string) => view.withdrawError(code, "fr");

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

describe("availability", () => {
  it("tells the badge where an item stands, and nothing when the funding is hidden", () => {
    expect(view.availability(item())).toBe("free");
    expect(view.availability(item({ funding: funding({ state: "in_progress" }) }))).toBe("progress");
    expect(view.availability(item({ funding: funding({ state: "almost" }) }))).toBe("progress");
    expect(view.availability(item({ funding: funding({ state: "complete" }) }))).toBe("done");
    expect(view.availability(item({ status: "received", funding: null }))).toBe("received");
    expect(view.availability(item({ funding: null }))).toBeNull();
  });
});

describe("standing", () => {
  const paul = [{ name: "Paul", mine: false }];

  it("says nothing without funding, and thanks for a received item", () => {
    expect(standing(item({ funding: null }))).toBeNull();
    expect(standing(item({ status: "received", funding: null }))).toBe("Déjà reçu : merci !");
  });

  it("says nothing of a free item, which its badge shows, and tells who reserved it", () => {
    expect(standing(item())).toBeNull();
    expect(standing(item({ funding: funding({ state: "complete", contributors: paul }) }))).toBe(
      "Réservé par Paul.",
    );
    expect(standing(item({ funding: funding({ state: "complete" }) }))).toBe("Déjà réservé.");
  });

  it("counts the times a repeatable item was given", () => {
    expect(standing(item({ repeatable: true }))).toBeNull();
    expect(standing(item({ repeatable: true, funding: funding({ timesGiven: 1 }) }))).toContain("une fois");
    expect(standing(item({ repeatable: true, funding: funding({ timesGiven: 3 }) }))).toContain("3 fois");
  });

  it("counts the copies of a quantity item", () => {
    const copies = (reservedUnits: number, quantity = 5, contributors = paul) =>
      standing(item({ kind: "quantity", quantity, funding: funding({ reservedUnits, contributors }) }));
    expect(copies(0, 5, [])).toBeNull();
    expect(copies(0, 1, [])).toBeNull();
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

describe("a gift shared by amounts", () => {
  const priced = (patch: Partial<Funding> = {}) =>
    item({ priceCents: 20000, funding: funding({ totalCents: 0, remainingCents: 20000, ...patch }) });
  const paul = [{ name: "Paul", mine: false }];

  it("is any unique gift with a price, given once", () => {
    expect(view.takesShares(priced())).toBe(true);
    expect(view.takesShares(item())).toBe(false);
    expect(view.takesShares(item({ priceCents: 20000, repeatable: true }))).toBe(false);
    expect(view.takesShares(item({ kind: "pool", priceCents: 20000 }))).toBe(false);
    expect(view.sharing(priced())).toBe(false);
    expect(view.sharing(priced({ totalCents: 5000 }))).toBe(true);
  });

  it("offers to give it whole or to chip in, then only to chip in", () => {
    expect(standing(priced())).toBeNull();
    expect(giveLabel(priced())).toBe("Je l'offre ou je participe");
    const started = priced({
      state: "in_progress",
      totalCents: 5000,
      remainingCents: 15000,
      contributors: paul,
    });
    expect(plain(standing(started))).toBe("50 € réunis sur 200 € : il manque 150 €, avec Paul.");
    expect(giveLabel(started)).toBe("Je participe");
    expect(canGive(started, { viewer: "guest", event: null })).toBe(true);
  });

  it("is given together once the shares reach the price", () => {
    const done = priced({ state: "complete", totalCents: 20000, remainingCents: 0, contributors: paul });
    expect(standing(done)).toBe("Offert ensemble, par Paul.");
    const anonymous = priced({ state: "complete", totalCents: 20000, remainingCents: 0 });
    expect(standing(anonymous)).toBe("Offert ensemble.");
    expect(canGive(done, { viewer: "guest", event: null })).toBe(false);
    const reserved = priced({ state: "complete", reservedUnits: 1, contributors: paul });
    expect(standing(reserved)).toBe("Réservé par Paul.");
    expect(canGive(reserved, { viewer: "guest", event: null })).toBe(false);
  });

  it("draws a bar up to the price once shared, and none before", () => {
    expect(poolBar(priced(), [])).toBeNull();
    const bar = poolBar(priced({ totalCents: 5000, byEvent: [{ eventId: null, amountCents: 5000 }] }), []);
    expect(bar?.segments).toEqual([
      { key: "none", label: "Sans occasion", cents: 5000, start: 0, width: 0.25, tone: 0 },
    ]);
    expect(bar?.target).toBe(1);
    expect(bar?.overshoot).toBeNull();
  });

  it("says so in English", () => {
    expect(view.giveLabel(priced(), "en")).toBe("I'll give it or chip in");
    expect(view.giveError("amount_too_high", "en")).toContain("more than what is missing");
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
      "2 complets, 2 en cours, 1 à offrir.",
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

describe("in English", () => {
  const en = "en" as const;

  it("writes amounts, days and names the English way", () => {
    expect(view.formatEuros(4990, en)).toBe("€49.90");
    expect(view.formatEuros(12000, en)).toBe("€120");
    expect(view.formatDay("2026-12-24", en)).toBe("Thursday, 24 December 2026");
    expect(view.joinNames(["Paul", "Jeanne", "Léa"], en)).toBe("Paul, Jeanne and Léa");
  });

  it("says where an item stands", () => {
    const paul = [{ name: "Paul", mine: false }];
    expect(view.standing(item({ status: "received", funding: null }), en)).toBe(
      "Already received: thank you!",
    );
    expect(view.standing(item({ funding: funding({ state: "complete", contributors: paul }) }), en)).toBe(
      "Reserved by Paul.",
    );
    expect(view.standing(item({ repeatable: true, funding: funding({ timesGiven: 2 }) }), en)).toContain(
      "twice",
    );
    expect(
      view.standing(
        item({
          kind: "quantity",
          quantity: 4,
          funding: funding({ reservedUnits: 2, contributors: [...paul, { name: null, mine: false }] }),
        }),
        en,
      ),
    ).toBe("2 of 4 already reserved, by Paul and someone discreet.");
    expect(
      view.standing(
        item({
          kind: "pool",
          targetCents: 10000,
          funding: funding({ totalCents: 4000, remainingCents: 6000, contributors: paul }),
        }),
        en,
      ),
    ).toBe("€40 raised of €100: €60 to go, with Paul.");
  });

  it("names the buttons, the errors and the gauge", () => {
    expect(view.giveLabel(item({ kind: "pool" }), en)).toBe("I'll chip in");
    expect(view.giveError("weird", en)).toContain("Try again");
    expect(view.withdrawError("list_closed", en)).toContain("lifted");
    expect(view.heading({ list: null, event: null }, en)).toBe("Wishlist");
    expect(view.gaugeLine({ complete: 2, inProgress: 1, free: 1 }, en)).toBe(
      "2 complete, 1 in progress, 1 to give.",
    );
    expect(
      view.myGiftLine(
        { id: "g", itemId: "i", eventId: null, amountCents: null, units: 2 },
        item({ kind: "quantity" }),
        en,
      ),
    ).toBe("You are reserving 2.");
  });
});
