import type { Funding, PublicItem } from "./types.ts";

/**
 * The owner's preview (« Aperçu »): their items as their relatives see them, with made-up
 * contributions. Built from the items alone, never from a real contribution: the owner must learn
 * nothing (CLAUDE.md, rule 1). The names are plainly examples.
 */

export const SAMPLE_NAMES = ["Camille (exemple)", "Hugo (exemple)"] as const;

/** An item as the management app knows it. */
export type SampleSource = Omit<PublicItem, "funding" | "eventIds" | "status"> & {
  status: "open" | "received" | "archived";
};

const [first, second] = SAMPLE_NAMES;
const named = (name: string) => ({ name, mine: false });
const anonymous = { name: null, mine: false };

/** Made-up funding for the item at this place in the list: a few given, a few free, never all. */
export function sampleFunding(item: SampleSource, index: number): Funding {
  const given = index % 3 !== 2;
  switch (item.kind) {
    case "unique":
      if (item.repeatable) {
        return { state: "free", progress: 0, timesGiven: given ? 1 : 0, contributors: [] };
      }
      return given && index % 3 === 0
        ? { state: "complete", progress: 1, reservedUnits: 1, contributors: [named(first)] }
        : { state: "free", progress: 0, reservedUnits: 0, contributors: [] };
    case "quantity": {
      const wanted = Math.max(1, item.quantity ?? 1);
      const taken = given ? Math.max(1, Math.floor(wanted / 2)) : 0;
      const contributors = taken === 0 ? [] : taken === 1 ? [named(first)] : [named(first), anonymous];
      return {
        state: taken === 0 ? "free" : taken >= wanted ? "complete" : "in_progress",
        progress: taken / wanted,
        reservedUnits: taken,
        contributors,
      };
    }
    case "pool": {
      const target = item.targetCents ?? 0;
      if (!given) {
        return {
          state: "free",
          progress: 0,
          totalCents: 0,
          remainingCents: target || null,
          overshootCents: target ? 0 : null,
          byEvent: [],
          contributors: [],
        };
      }
      // 60 % or 85 % of the target, in whole euros, to show both; 50 € without a target
      const share = index % 3 === 0 ? 0.6 : 0.85;
      const total = target ? Math.max(100, Math.round((target * share) / 100) * 100) : 5000;
      const progress = target ? total / target : 0;
      return {
        state: target && progress >= 0.8 ? "almost" : "in_progress",
        progress,
        totalCents: total,
        remainingCents: target ? target - total : null,
        overshootCents: target ? 0 : null,
        byEvent: [{ eventId: null, amountCents: total }],
        contributors: [named(first), named(second), anonymous],
      };
    }
  }
}

/** The items the relatives see, in the owner's order, each with made-up funding. */
export function samplePreview(items: readonly SampleSource[]): PublicItem[] {
  return items
    .filter((item) => item.status !== "archived")
    .map((item, index): PublicItem => ({
      ...item,
      status: item.status === "received" ? "received" : "open",
      eventIds: [],
      funding: item.status === "received" ? null : sampleFunding(item, index),
    }));
}
