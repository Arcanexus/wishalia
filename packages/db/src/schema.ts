/**
 * The data model (spec, section 2). Amounts are integers in cents. "Funded" is never stored: it is
 * computed from the contributions by @wishalia/domain.
 */
import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export const wishKind = pgEnum("wish_kind", ["unique", "quantity", "pool"]);
export const wishStatus = pgEnum("wish_status", ["open", "received", "archived"]);
export const seriesVolumeState = pgEnum("series_volume_state", ["owned", "wanted", "given"]);
export const eventKind = pgEnum("event_kind", ["birthday", "christmas", "other"]);
export const contributionStatus = pgEnum("contribution_status", ["active", "withdrawn"]);
export const shareScope = pgEnum("share_scope", ["list", "event"]);
export const historyVisibility = pgEnum("history_visibility", ["owner", "guests", "sealed"]);
export const listTheme = pgEnum("list_theme", ["neutral", "christmas"]);

/** An account. Owner of its lists, guest on the others: the role is per list or event. */
export const users = pgTable("users", {
  id: id(),
  // Nullable: an anonymised account keeps its row but loses its email
  email: text("email").unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  displayName: text("display_name").notNull(),
  image: text("image"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
  // GDPR: a deleted account is anonymised (email and name cleared), never removed from the history
  deletedAt: timestamp("deleted_at", { withTimezone: true }),
});

// Tables of Better Auth (apps/api/src/auth.ts). Names and columns follow its core schema and its
// passkey plugin; the API maps them in the Drizzle adapter.

/** A signed-in device. The cookie holds the signed token; deleting the row signs the device out. */
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    token: text("token").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("auth_sessions_user_idx").on(table.userId)],
);

/** A way to sign in: the OIDC provider of the owner. No password is ever stored (column unused). */
export const authAccounts = pgTable(
  "auth_accounts",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    // Encrypted by Better Auth (account.encryptOAuthTokens)
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    password: text("password"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index("auth_accounts_user_idx").on(table.userId),
    uniqueIndex("auth_accounts_provider_idx").on(table.providerId, table.accountId),
  ],
);

/** Short-lived secrets: magic links (stored hashed), OAuth state. */
export const authVerifications = pgTable(
  "auth_verifications",
  {
    id: id(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [index("auth_verifications_identifier_idx").on(table.identifier)],
);

/** A WebAuthn credential (passkey). Only the public key is stored. */
export const authPasskeys = pgTable(
  "auth_passkeys",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name"),
    publicKey: text("public_key").notNull(),
    credentialID: text("credential_id").notNull().unique(),
    counter: integer("counter").notNull(),
    deviceType: text("device_type").notNull(),
    backedUp: boolean("backed_up").notNull(),
    transports: text("transports"),
    aaguid: text("aaguid"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
  },
  (table) => [index("auth_passkeys_user_idx").on(table.userId)],
);

/** A durable list ("Books", "Home"). */
export const wishLists = pgTable(
  "wish_lists",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    position: integer("position").notNull().default(0),
    /**
     * A theme the owner forces on everyone who opens the list; null lets each person's choice
     * apply. The light or dark mode always stays personal (docs/branding.md).
     */
    theme: listTheme("theme"),
    createdAt: createdAt(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [index("wish_lists_owner_idx").on(table.ownerId, table.position)],
);

/** An ordered group of items: volumes of a book, comic or manga series, box sets. */
export const series = pgTable("series", {
  id: id(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id),
  name: text("name").notNull(),
  kind: text("kind").notNull().default("books"),
  /** Null while the series is still running. */
  totalVolumes: integer("total_volumes"),
  /** ISBN, Open Library, Google Books ids. */
  externalIds: jsonb("external_ids").$type<Record<string, string>>().notNull().default({}),
  createdAt: createdAt(),
});

/** An item of a list. */
export const wishes = pgTable(
  "wishes",
  {
    id: id(),
    listId: uuid("list_id")
      .notNull()
      .references(() => wishLists.id),
    kind: wishKind("kind").notNull().default("unique"),
    /** Never "received": can be given at every event. */
    repeatable: boolean("repeatable").notNull().default(false),
    title: text("title").notNull(),
    /** The raw URL first, cleaned and enriched by the worker. */
    url: text("url"),
    notes: text("notes"),
    imageKey: text("image_key"),
    priceCents: integer("price_cents"),
    /** Pool only. */
    targetCents: integer("target_cents"),
    /** Quantity only. */
    quantity: integer("quantity"),
    seriesId: uuid("series_id").references(() => series.id),
    seriesNumber: integer("series_number"),
    seriesState: seriesVolumeState("series_state"),
    status: wishStatus("status").notNull().default("open"),
    position: integer("position").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("wishes_list_idx").on(table.listId, table.position),
    index("wishes_series_idx").on(table.seriesId, table.seriesNumber),
    check(
      "wishes_pool_target",
      sql`${table.kind} <> 'pool' OR ${table.targetCents} IS NULL OR ${table.targetCents} > 0`,
    ),
    check(
      "wishes_quantity",
      sql`${table.kind} <> 'quantity' OR (${table.quantity} IS NOT NULL AND ${table.quantity} > 0)`,
    ),
    check("wishes_amounts", sql`(${table.priceCents} IS NULL OR ${table.priceCents} >= 0)`),
    check("wishes_series", sql`(${table.seriesId} IS NULL) = (${table.seriesNumber} IS NULL)`),
  ],
);

/** A dated occasion. It selects items, it does not own them. */
export const events = pgTable(
  "events",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    kind: eventKind("kind").notNull().default("other"),
    date: date("date", { mode: "string" }).notNull(),
    revealDelayDays: integer("reveal_delay_days").notNull().default(3),
    /** When the owner lifted the secret, null while it is kept. */
    revealedAt: timestamp("revealed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    index("events_owner_idx").on(table.ownerId, table.date),
    check("events_reveal_delay", sql`${table.revealDelayDays} >= 0`),
  ],
);

/** Link between an event and an item. */
export const eventWishes = pgTable(
  "event_wishes",
  {
    eventId: uuid("event_id")
      .notNull()
      .references(() => events.id, { onDelete: "cascade" }),
    wishId: uuid("wish_id")
      .notNull()
      .references(() => wishes.id),
    position: integer("position").notNull().default(0),
    addedAt: createdAt(),
  },
  (table) => [primaryKey({ columns: [table.eventId, table.wishId] })],
);

/** A share link. Only the SHA-256 hash of its token is stored: a database leak opens no list. */
export const shareLinks = pgTable(
  "share_links",
  {
    id: id(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull(),
    scope: shareScope("scope").notNull(),
    listId: uuid("list_id").references(() => wishLists.id),
    eventId: uuid("event_id").references(() => events.id),
    /** Who it was made for ("Grandma", "The cousins"): links are per guest or group. */
    audience: text("audience").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("share_links_token_idx").on(table.tokenHash),
    check(
      "share_links_target",
      sql`(${table.scope} = 'list' AND ${table.listId} IS NOT NULL AND ${table.eventId} IS NULL) OR (${table.scope} = 'event' AND ${table.eventId} IS NOT NULL AND ${table.listId} IS NULL)`,
    ),
  ],
);

/** A guest's contribution to an item, within an event. A pledge: the money is settled outside. */
export const contributions = pgTable(
  "contributions",
  {
    id: id(),
    wishId: uuid("wish_id")
      .notNull()
      .references(() => wishes.id),
    /** Null without an event: a list is not always tied to one. The item then keeps the secret. */
    eventId: uuid("event_id").references(() => events.id),
    /** Null for a guest without an account, who then gives a name. */
    contributorId: uuid("contributor_id").references(() => users.id),
    guestName: text("guest_name"),
    shareLinkId: uuid("share_link_id").references(() => shareLinks.id),
    /** Pool: the amount pledged. */
    amountCents: integer("amount_cents"),
    /** Unique and quantity: the copies reserved. */
    units: integer("units"),
    status: contributionStatus("status").notNull().default("active"),
    message: text("message"),
    anonymous: boolean("anonymous").notNull().default(false),
    /**
     * SHA-256 of the key that lets a guest without an account withdraw their contribution. The key
     * itself is given once, when the contribution is made, and kept on their device.
     */
    withdrawKeyHash: text("withdraw_key_hash"),
    createdAt: createdAt(),
    withdrawnAt: timestamp("withdrawn_at", { withTimezone: true }),
  },
  (table) => [
    index("contributions_wish_idx").on(table.wishId, table.eventId),
    check("contributions_who", sql`${table.contributorId} IS NOT NULL OR ${table.guestName} IS NOT NULL`),
    check(
      "contributions_what",
      sql`(${table.amountCents} IS NOT NULL AND ${table.amountCents} > 0) OR (${table.units} IS NOT NULL AND ${table.units} > 0)`,
    ),
  ],
);

/**
 * The append-only history of the items. A trigger (migration 0001) rejects any UPDATE or DELETE:
 * the only change allowed is the anonymisation of a deleted account, done on `users`.
 */
export const itemEvents = pgTable(
  "item_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    wishId: uuid("wish_id")
      .notNull()
      .references(() => wishes.id),
    type: text("type").notNull(),
    actorId: uuid("actor_id").references(() => users.id),
    at: timestamp("at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    visibility: historyVisibility("visibility").notNull(),
  },
  (table) => [index("item_events_wish_idx").on(table.wishId, table.at)],
);

/** History entry types (spec, section 7). */
export const ITEM_EVENT_TYPES = [
  "created",
  "updated",
  "price_changed",
  "moved",
  "added_to_event",
  "removed_from_event",
  "contribution_added",
  "contribution_updated",
  "contribution_withdrawn",
  "reserved",
  "received",
  "archived",
] as const;
export type ItemEventType = (typeof ITEM_EVENT_TYPES)[number];
