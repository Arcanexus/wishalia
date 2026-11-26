import type { LocaleChoice } from "@wishalia/i18n";

/** What the management app reads from /manage (docs/api.md). Never any contribution data. */

export interface Me {
  id: string;
  displayName: string;
  email: string;
  theme: "auto" | "neutral" | "christmas";
  mode: "device" | "light" | "dark";
  /** The language chosen with the account; « auto » follows the browser (docs/i18n.md). */
  locale: LocaleChoice;
  /** What this server offers: images need its S3 bucket and imgproxy. */
  features?: { images: boolean };
}

export interface List {
  id: string;
  name: string;
  position: number;
  /** The icon shown next to its name (docs/list-pictures.md); null shows the default one. */
  icon: string | null;
  /** The image the owner sent, shown instead of the icon (signed squares under /img). */
  image: ImageSources | null;
  theme: "neutral" | "christmas" | null;
  revealMode: "received" | "manual";
  secretLifted: boolean;
  /** Private: share links only. Public: the home page's search finds it, anyone may take part. */
  visibility: "private" | "public";
  /** The open link of a public list, null while private. */
  openUrl: string | null;
  itemCount: number;
  createdAt: string;
  archivedAt: string | null;
}

export type ItemStatus = "open" | "received" | "archived";

export interface Item {
  id: string;
  listId: string;
  /** « series » groups volumes (docs/series.md): wishes whose parentId it is. */
  kind: "unique" | "quantity" | "pool" | "series";
  /** The series this wish is a volume of, null for a wish of its own. */
  parentId: string | null;
  /** Given again at every occasion: never received. */
  repeatable: boolean;
  title: string;
  url: string | null;
  notes: string | null;
  /** The image shown, framed, in three sizes (signed paths under /img); null without one. */
  image?: ImageSources | null;
  imageCrop?: Crop | null;
  priceCents: number | null;
  /** A pool's target. */
  targetCents: number | null;
  /** How many copies are wanted. */
  quantity: number | null;
  status: ItemStatus;
  position: number;
  /** The completion from the link (title, price): "pending" while the worker has it to do. */
  enrichment?: "pending" | "done" | "failed" | null;
  /** While pending: "images" once the title and price are written and the images are on their way. */
  enrichmentStep?: "images" | null;
  createdAt: string;
}

/** Signed thumbnail paths: small 192 px, medium 480 px (both framed), large whole. */
export interface ImageSources {
  small: string;
  medium: string;
  large: string;
  /** The item's other images, whole: only on an item's image shown (opened big). */
  gallery?: string[];
}

/** A frame, as fractions (0 to 1) of the image's width and height. */
export interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The images of an item to choose from: the owner's own, then the page's proposals. */
export interface ItemImages {
  imageId: string | null;
  crop: Crop | null;
  images: {
    id: string;
    source: "page" | "upload";
    width: number | null;
    height: number | null;
    sources: ImageSources;
    /** For a series, the volume an image belongs to (docs/series.md); null for its own. */
    volume?: { id: string; title: string } | null;
  }[];
}

/** The quick add's answer: the item, and the open items that already have its link. */
export type AddedItem = Item & { duplicateOf: string[] };

/** What the quick add action answers (lib/server/items.ts). */
export type AddResult =
  | { item: { id: string; title: string; listId: string }; duplicate: boolean }
  | { error: string; input: string };

export type EventKind = "birthday" | "christmas" | "other";

export interface WishEvent {
  id: string;
  name: string;
  kind: EventKind;
  /** A calendar day, YYYY-MM-DD. */
  date: string;
  revealDelayDays: number;
  /** When the owner may lift the secret. */
  revealAvailableAt: string;
  canReveal: boolean;
  secretLifted: boolean;
}

export interface HistoryEntry {
  id: number;
  type: string;
  at: string;
  actorId: string | null;
  payload: Record<string, unknown>;
}

/** Who gave what to an item of an event, once its secret is lifted. */
export interface Gift {
  name: string | null;
  amountCents: number | null;
  units: number | null;
  /** The word the guest left for the owner. */
  message: string | null;
}

export interface ShareLink {
  id: string;
  scope: "list" | "event";
  listId: string | null;
  eventId: string | null;
  /** Who the link is for: « Mamie », « Les cousins ». */
  audience: string;
  expiresAt: string | null;
  revokedAt: string | null;
  active: boolean;
  createdAt: string;
}

/** A link just made: its address is given once, never listed again. */
export type CreatedShareLink = ShareLink & { token: string; url: string };

export interface ApiToken {
  id: string;
  name: string;
  /** Its first characters, to recognise it: wsh_Ab3d. */
  prefix: string;
  readOnly: boolean;
  expiresAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  active: boolean;
  createdAt: string;
}

/** A passkey of the signed-in person, as the settings show it: never its key or credential id. */
export interface Passkey {
  id: string;
  name: string | null;
  createdAt: string | null;
  /** Synced by the phone or computer's password manager (iCloud, Google...), so on all its devices. */
  synced: boolean;
}

/** What the edit form sends back, to fill it in again when something is wrong. */
export interface EditValues {
  title: string;
  url: string;
  price: string;
  notes: string;
  kind: string;
  quantity: string;
  target: string;
  repeatable: boolean;
  listId: string;
}
