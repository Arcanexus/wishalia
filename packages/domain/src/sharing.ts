import {
  amountTarget,
  remainingToFund,
  reservedUnits,
  takesShares,
  totalFunded,
  type ContributionFunding,
  type WishFunding,
} from "./funding.js";

/**
 * Share links and contributions (spec, sections 2.2 and 3): pure rules, called by the public API
 * in the transaction that writes, after the item row is locked.
 */

export interface ShareLinkState {
  expiresAt: Date | null;
  revokedAt: Date | null;
}

/** Whether a share link still opens its list or event: not revoked, not expired. */
export function isShareLinkActive(link: ShareLinkState, now: Date): boolean {
  if (link.revokedAt !== null && link.revokedAt.getTime() <= now.getTime()) return false;
  return link.expiresAt === null || link.expiresAt.getTime() > now.getTime();
}

export interface ContributionRequest {
  /** Null without an event: a repeatable item then counts the contributions without an event. */
  eventId: string | null;
  /** Pool, or a share of a unique gift: the amount pledged, in cents. */
  amountCents?: number | null;
  /** Unique and quantity: the copies reserved. Ignored when a unique gift gets an amount. */
  units?: number | null;
}

export type ContributionRefusal =
  | "item_closed"
  | "amount_required"
  | "units_required"
  | "already_reserved"
  | "already_shared"
  | "not_enough_left"
  | "amount_too_high"
  | "shares_not_taken"
  | "series_by_volume";

export interface ContributableWish extends WishFunding {
  status: "open" | "received" | "archived";
}

/**
 * Whether a contribution may be added to an item, given its active contributions, or why not.
 * - A pool takes any positive amount: overshoot is allowed (spec §2.1).
 * - A unique item takes one reservation; a repeatable one, one per event.
 * - A unique gift given once may instead be shared, once nobody reserved it whole: amounts up to
 *   what is left of its price, or any amount when it has none; and nobody reserves it whole once
 *   someone gave a share.
 * - A quantity item takes up to the copies left (per event when it is repeatable).
 * A received or archived item takes nothing.
 */
export function refuseContribution(
  wish: ContributableWish,
  contributions: readonly ContributionFunding[],
  request: ContributionRequest,
): ContributionRefusal | null {
  if (wish.status !== "open") return "item_closed";
  // A series is given volume by volume (docs/series.md)
  if (wish.kind === "series") return "series_by_volume";
  if (wish.kind === "pool") {
    return request.amountCents && request.amountCents > 0 ? null : "amount_required";
  }
  if (wish.kind === "unique" && request.amountCents !== undefined && request.amountCents !== null) {
    if (!takesShares(wish)) return "shares_not_taken";
    if (!Number.isInteger(request.amountCents) || request.amountCents <= 0) return "amount_required";
    if (reservedUnits(contributions) > 0) return "already_reserved";
    const price = amountTarget(wish);
    if (price === null) return null;
    const left = remainingToFund(price, totalFunded(contributions));
    if (left <= 0) return "already_reserved";
    return request.amountCents > left ? "amount_too_high" : null;
  }
  const units = request.units ?? (wish.kind === "unique" ? 1 : 0);
  if (!Number.isInteger(units) || units <= 0) return "units_required";
  const counted = wish.repeatable
    ? contributions.filter((contribution) => contribution.eventId === request.eventId)
    : contributions;
  const taken = reservedUnits(counted);
  if (wish.kind === "unique") {
    if (units !== 1) return "units_required";
    if (taken > 0) return "already_reserved";
    return totalFunded(counted) > 0 ? "already_shared" : null;
  }
  const wanted = Math.max(1, wish.quantity ?? 1);
  return taken + units > wanted ? "not_enough_left" : null;
}
