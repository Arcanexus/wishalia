import { describe, expect, it } from "vitest";

import { sampleNames, samplePreview, type SampleSource } from "./sample.ts";
import { formatEuros as euros, standing } from "./view.ts";

const SAMPLE_NAMES = sampleNames("fr");
const formatEuros = (cents: number) => euros(cents, "fr");

const item = (patch: Partial<SampleSource>): SampleSource => ({
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
  ...patch,
});

describe("samplePreview", () => {
  it("gives every kind made-up funding, plainly named as examples", () => {
    const items = samplePreview(
      [
        item({ id: "a" }),
        item({ id: "b", kind: "quantity", quantity: 4 }),
        item({ id: "c", kind: "pool", targetCents: 30000 }),
        item({ id: "d", kind: "pool" }),
        item({ id: "e", repeatable: true }),
        item({ id: "f", kind: "quantity", quantity: 1 }),
        item({ id: "g", kind: "quantity", quantity: 3 }),
        item({ id: "h", kind: "pool", targetCents: 5000 }),
      ],
      "fr",
    );
    expect(items.map((entry) => standing(entry, "fr"))).toEqual([
      `Réservé par ${SAMPLE_NAMES[0]}.`,
      `2 sur 4 déjà réservés, par ${SAMPLE_NAMES[0]} et une personne discrète.`,
      `Cagnotte de ${formatEuros(30000)}, à lancer.`,
      `${formatEuros(5000)} réunis, avec ${SAMPLE_NAMES[0]}, ${SAMPLE_NAMES[1]} et une personne discrète.`,
      "Déjà offert une fois, et peut l'être encore.",
      null,
      `1 sur 3 déjà réservé, par ${SAMPLE_NAMES[0]}.`,
      `${formatEuros(4300)} réunis sur ${formatEuros(5000)} : il manque ${formatEuros(700)}, avec ${SAMPLE_NAMES[0]}, ${SAMPLE_NAMES[1]} et une personne discrète.`,
    ]);
    expect(items.every((entry) => entry.eventIds.length === 0)).toBe(true);
  });

  it("draws a pool part funded, and a quantity item all taken when only one is wanted", () => {
    const [pool, , copy] = samplePreview(
      [
        item({ kind: "pool", targetCents: 10000 }),
        item({}),
        item({ kind: "quantity", quantity: 1 }),
        item({ kind: "quantity" }),
      ],
      "fr",
    );
    expect(pool?.funding).toMatchObject({ state: "in_progress", totalCents: 6000, remainingCents: 4000 });
    expect(copy?.funding).toMatchObject({ state: "free", reservedUnits: 0 });
    const [single] = samplePreview([item({ kind: "quantity", quantity: 1 })], "fr");
    expect(single?.funding).toMatchObject({ state: "complete", reservedUnits: 1 });
  });

  it("marks a pool almost complete past 80 %, and leaves out the archived items", () => {
    const items = samplePreview(
      [
        item({ id: "x", status: "archived" }),
        item({ id: "p", kind: "pool", targetCents: 1000 }),
        item({ id: "r", status: "received" }),
      ],
      "fr",
    );
    expect(items.map((entry) => entry.id)).toEqual(["p", "r"]);
    expect(items[0]?.funding?.state).toBe("in_progress");
    expect(items[1]).toMatchObject({ status: "received", funding: null });
    const [, almost] = samplePreview([item({}), item({ kind: "pool", targetCents: 700 })], "fr");
    expect(almost?.funding).toMatchObject({ state: "almost", totalCents: 600 });
  });
});
