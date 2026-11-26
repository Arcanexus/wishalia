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
  /** A pool's total for each event, in the order the money came; null for no event. */
  byEvent?: { eventId: string | null; amountCents: number }[];
  timesGiven?: number;
  /** Who gave: a name, or null when anonymous. Never an amount. */
  contributors: { name: string | null; mine: boolean }[];
  /** The signed-in person's own contributions, with what only they may see. */
  mine?: { id: string; eventId: string | null; amountCents: number | null; units: number | null }[];
}

/** A contribution of the person looking, from their account or kept on their device. */
/**
 * One of the person's gifts whose item left the list (docs/archive-delete.md): archived, the gift
 * is kept and may be taken back; deleted, it was cancelled.
 */
export interface GoneGift {
  id: string;
  itemId: string;
  title: string;
  state: "archived" | "deleted";
  eventId: string | null;
  amountCents: number | null;
  units: number | null;
}

export interface MyGift {
  id: string;
  itemId: string;
  eventId: string | null;
  amountCents: number | null;
  units: number | null;
}

/** Signed thumbnail paths, served by the frontend under /img (docs/images.md). */
export interface ImageSources {
  small: string;
  medium: string;
  large: string;
  /** The item's other images, whole, for the viewer that opens them big. */
  gallery?: string[];
}

export interface PublicItem {
  id: string;
  kind: ItemKind;
  repeatable: boolean;
  title: string;
  url: string | null;
  notes: string | null;
  /** The image the owner shows, framed; null without one. */
  image?: ImageSources | null;
  /** Being completed from its link (docs/live-updates.md): the page follows it live. */
  stage?: "reading" | "images" | null;
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
  /** The open link of a public list: for anyone, so the page greets everyone. */
  open?: boolean;
  scope: "list" | "event";
  viewer: Viewer;
  owner: { displayName: string };
  me: { displayName: string } | null;
  list: {
    id: string;
    name: string;
    theme: "neutral" | "christmas" | null;
    /** Its picture (docs/list-pictures.md): the icon chosen (null: the default) or the owner's image. */
    icon?: string | null;
    image?: ListImage | null;
  } | null;
  event: PublicEvent | null;
  events: PublicEvent[];
  items: PublicItem[];
}

/** The signed thumbnails of the image the owner sent for a list (squares of 192 and 480 px). */
export interface ListImage {
  small: string;
  medium: string;
}
