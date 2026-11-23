/**
 * The anti-spoil rule (spec, section 3): the single function that decides whether a viewer may
 * see the contributions of an event. Every API calls it; nothing else may decide.
 *
 * - The owner of the list (recognised by their session OR by the long-lived device marker) sees
 *   nothing until they lift the secret, which is only possible once the event date plus the reveal
 *   delay has passed.
 * - A guest (a valid share link) sees the contributions, before and after the event.
 * - An unidentified visitor sees them too; the public view folds them behind a confirmation click.
 */

export type ViewerRole = "owner" | "guest" | "anonymous";

export interface ViewerSignals {
  /** The owner of the list or event being viewed. */
  ownerId: string;
  /** The user of the session, if any. */
  sessionUserId?: string | null;
  /** Users whose device marker is present on this device. */
  deviceMarkerUserIds?: readonly string[];
  /** Whether the request carries a valid (not revoked, not expired) share link. */
  hasValidShareLink: boolean;
}

/**
 * Who is looking. Owner detection wins over everything: an owner opening their own share link is
 * still the owner (spec: "propriétaire détecté → écran d'avertissement").
 */
export function resolveViewer(signals: ViewerSignals): ViewerRole {
  const { ownerId, sessionUserId, deviceMarkerUserIds = [], hasValidShareLink } = signals;
  if (sessionUserId === ownerId || deviceMarkerUserIds.includes(ownerId)) {
    return "owner";
  }
  return hasValidShareLink ? "guest" : "anonymous";
}

export interface RevealState {
  /** Date of the event (a calendar day), as YYYY-MM-DD. */
  eventDate: string;
  /** Days after the event before the owner may lift the secret (3 by default). */
  revealDelayDays: number;
  /** When the owner lifted the secret, null while it is kept. */
  revealedAt: Date | null;
}

export const DEFAULT_REVEAL_DELAY_DAYS = 3;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * First instant at which the owner may lift the secret: the end of the event day plus the delay,
 * in UTC. Using the end of the day keeps a late-evening contribution sealed.
 */
export function revealAvailableAt({ eventDate, revealDelayDays }: Omit<RevealState, "revealedAt">): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(eventDate);
  if (!match) {
    throw new RangeError(`An event date is YYYY-MM-DD, got ${eventDate}`);
  }
  if (!Number.isInteger(revealDelayDays) || revealDelayDays < 0) {
    throw new RangeError(`The reveal delay is a whole number of days, got ${revealDelayDays}`);
  }
  const [, year, month, day] = match;
  const endOfEventDay = Date.UTC(Number(year), Number(month) - 1, Number(day) + 1);
  return new Date(endOfEventDay + revealDelayDays * DAY_MS);
}

/** Whether the owner may lift the secret now. */
export function canRevealSecret(state: Omit<RevealState, "revealedAt">, now: Date): boolean {
  return now.getTime() >= revealAvailableAt(state).getTime();
}

/** Whether the secret is lifted: asked by the owner, and the reveal date reached. */
export function isSecretLifted(state: RevealState, now: Date): boolean {
  return (
    state.revealedAt !== null && canRevealSecret(state, now) && state.revealedAt.getTime() <= now.getTime()
  );
}

/** THE rule. Whether this viewer may see the contributions of this event, now. */
export function canSeeContributions(viewer: ViewerRole, state: RevealState, now: Date): boolean {
  if (viewer === "owner") {
    return isSecretLifted(state, now);
  }
  return true;
}

/** Visibility of an item history entry (spec, section 7). */
export type HistoryVisibility = "owner" | "guests" | "sealed";

/**
 * Whether a viewer may see a history entry:
 * - `owner`: not secret, everyone who can see the item sees it (creation, edits, price changes);
 * - `guests`: never shown to the owner (a reservation, for instance);
 * - `sealed`: contributions, shown to guests, and to the owner once the secret is lifted.
 */
export function canSeeHistoryEntry(
  visibility: HistoryVisibility,
  viewer: ViewerRole,
  state: RevealState,
  now: Date,
): boolean {
  switch (visibility) {
    case "owner":
      return true;
    case "guests":
      return viewer !== "owner";
    case "sealed":
      return canSeeContributions(viewer, state, now);
  }
}
