import { reservedUnits, type ContributionFunding, type WishFunding } from "./funding.js";

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
  /** Pool: the amount pledged, in cents. */
  amountCents?: number | null;
  /** Unique and quantity: the copies reserved. */
  units?: number | null;
}

export type ContributionRefusal =
  "item_closed" | "amount_required" | "units_required" | "already_reserved" | "not_enough_left";

export interface ContributableWish extends WishFunding {
  status: "open" | "received" | "archived";
}

/**
 * Whether a contribution may be added to an item, given its active contributions, or why not.
 * - A pool takes any positive amount: overshoot is allowed (spec §2.1).
 * - A unique item takes one reservation; a repeatable one, one per event.
 * - A quantity item takes up to the copies left (per event when it is repeatable).
 * A received or archived item takes nothing.
 */
export function refuseContribution(
  wish: ContributableWish,
  contributions: readonly ContributionFunding[],
  request: ContributionRequest,
): ContributionRefusal | null {
  if (wish.status !== "open") return "item_closed";
  if (wish.kind === "pool") {
    return request.amountCents && request.amountCents > 0 ? null : "amount_required";
  }
  const units = request.units ?? (wish.kind === "unique" ? 1 : 0);
  if (!Number.isInteger(units) || units <= 0) return "units_required";
  const counted = wish.repeatable
    ? contributions.filter((contribution) => contribution.eventId === request.eventId)
    : contributions;
  const taken = reservedUnits(counted);
  if (wish.kind === "unique") {
    if (units !== 1) return "units_required";
    return taken > 0 ? "already_reserved" : null;
  }
  const wanted = Math.max(1, wish.quantity ?? 1);
  return taken + units > wanted ? "not_enough_left" : null;
}
