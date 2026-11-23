import { cents, sum, type Cents } from "./money.js";

/**
 * Funding of an item, computed from its contributions. "Funded" is never stored: it is always
 * derived from the active contributions, across every event (spec, section 2.1 and 2.2).
 */

export type WishKind = "unique" | "quantity" | "pool";

export interface WishFunding {
  kind: WishKind;
  /** Never "complete": can be given again at every event. */
  repeatable: boolean;
  /** Pool: the target amount. */
  targetCents?: Cents | null;
  /** Quantity: the number of copies wanted. */
  quantity?: number | null;
}

export interface ContributionFunding {
  /** Null for a contribution made without an event. */
  eventId: string | null;
  status: "active" | "withdrawn";
  /** Pool: the amount pledged. */
  amountCents?: Cents | null;
  /** Unique and quantity: the copies reserved (1 for a unique item). */
  units?: number | null;
}

/** Display states of the public view (spec, section 4). */
export type ItemState = "free" | "in_progress" | "almost" | "complete";

/** From this share of the target, an item is "almost" funded. */
export const ALMOST_THRESHOLD = 0.8;

const active = (contributions: readonly ContributionFunding[]) =>
  contributions.filter((contribution) => contribution.status === "active");

/** Total pledged on a pool, over every event. Withdrawn contributions do not count. */
export function totalFunded(contributions: readonly ContributionFunding[]): Cents {
  return sum(active(contributions).map((contribution) => contribution.amountCents ?? cents(0)));
}

/** What is left to reach the target, never negative. */
export function remainingToFund(target: Cents, total: Cents): Cents {
  return cents(Math.max(0, target - total));
}

/** What goes beyond the target: overshoot is allowed (spec, section 2.1). */
export function overshoot(target: Cents, total: Cents): Cents {
  return cents(Math.max(0, total - target));
}

/** Copies reserved on a quantity or unique item. */
export function reservedUnits(contributions: readonly ContributionFunding[]): number {
  return active(contributions).reduce((total, contribution) => total + (contribution.units ?? 0), 0);
}

/** Total pledged per event, in the order the events first appear: the segments of the pool bar. */
export function fundingByEvent(contributions: readonly ContributionFunding[]): Map<string | null, Cents> {
  const segments = new Map<string | null, Cents>();
  for (const contribution of active(contributions)) {
    const current = segments.get(contribution.eventId) ?? cents(0);
    segments.set(contribution.eventId, cents(current + (contribution.amountCents ?? 0)));
  }
  return segments;
}

/** Number of events in which a repeatable item was given ("given N times"). */
export function timesGiven(contributions: readonly ContributionFunding[]): number {
  return new Set(active(contributions).map((contribution) => contribution.eventId)).size;
}

/**
 * Share of the item that is covered, between 0 and 1 (overshoot is capped at 1 here; see
 * `overshoot` for the amount beyond the target).
 */
export function progress(wish: WishFunding, contributions: readonly ContributionFunding[]): number {
  switch (wish.kind) {
    case "pool": {
      const target = wish.targetCents ?? 0;
      const total = totalFunded(contributions);
      if (target <= 0) {
        // A pool without a target is complete as soon as someone pledges
        return total > 0 ? 1 : 0;
      }
      return Math.min(1, total / target);
    }
    case "quantity": {
      const wanted = Math.max(1, wish.quantity ?? 1);
      return Math.min(1, reservedUnits(contributions) / wanted);
    }
    case "unique":
      return reservedUnits(contributions) > 0 ? 1 : 0;
  }
}

/**
 * State of an item for the public view. A repeatable item is judged on one event only (it can be
 * given again at the next one): pass the event being shown.
 */
export function itemState(
  wish: WishFunding,
  contributions: readonly ContributionFunding[],
  eventId?: string | null,
): ItemState {
  const relevant =
    wish.repeatable && eventId !== undefined
      ? contributions.filter((contribution) => contribution.eventId === eventId)
      : contributions;
  const ratio = progress(wish, relevant);
  if (ratio >= 1) {
    return "complete";
  }
  if (ratio >= ALMOST_THRESHOLD) {
    return "almost";
  }
  return ratio > 0 ? "in_progress" : "free";
}
