/**
 * What the public view reads from GET /public/view (docs/public-api.md). The funding is null when
 * the viewer may not see it: always for the owner while a secret is kept.
 */

export type Viewer = "owner" | "guest" | "anonymous";
export type ItemKind = "unique" | "quantity" | "pool";
export type ItemState = "free" | "in_progress" | "almost" | "complete";

export interface PublicEvent {
  id: string;
  name: string;
  kind: "birthday" | "christmas" | "other";
  /** YYYY-MM-DD */
  date: string;
  /** Contributions are still taken: its secret is not lifted. */
  open: boolean;
}

export interface Funding {
  state: ItemState;
  /** 0 to 1. */
  progress: number;
  totalCents?: number;
  remainingCents?: number | null;
  overshootCents?: number | null;
  reservedUnits?: number;
  timesGiven?: number;
  /** Who gave: a name, or null when anonymous. Never an amount. */
  contributors: { name: string | null; mine: boolean }[];
}

export interface PublicItem {
  id: string;
  kind: ItemKind;
  repeatable: boolean;
  title: string;
  url: string | null;
  notes: string | null;
  priceCents: number | null;
  targetCents: number | null;
  quantity: number | null;
  status: "open" | "received";
  eventIds: string[];
  funding: Funding | null;
}

export interface PublicView {
  /** Who the link was made for: « Mamie », « Les cousins ». */
  audience: string;
  scope: "list" | "event";
  viewer: Viewer;
  owner: { displayName: string };
  me: { displayName: string } | null;
  list: { id: string; name: string; theme: "neutral" | "christmas" | null } | null;
  event: PublicEvent | null;
  events: PublicEvent[];
  items: PublicItem[];
}
