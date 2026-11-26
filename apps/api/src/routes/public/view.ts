import { type Database, schema } from "@wishalia/db";
import {
  amountTarget,
  canSeeContributions,
  cents,
  fundingByEvent,
  giverNameShown,
  isSecretLifted,
  itemState,
  overshoot,
  progress,
  remainingToFund,
  reservedUnits,
  takesShares,
  timesGiven,
  totalFunded,
  isLive,
  stageOf,
  type SecretState,
  type ViewerRole,
} from "@wishalia/domain";
import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";

import type { Tx } from "../../history.js";
import { HttpError } from "../../http.js";
import { imagesOf, listPictureOf, type Images } from "../../images.js";
import { eventLive, listLive } from "../../live.js";
import { itemSecret, revealState } from "../../secrets.js";
import type { ShareContext } from "./index.js";

type WishRow = typeof schema.wishes.$inferSelect;
type EventRow = typeof schema.events.$inferSelect;
type LinkRow = ShareContext["link"];

export function shareOf(request: FastifyRequest): ShareContext {
  if (!request.share) throw new HttpError(404, "link_not_found");
  return request.share;
}

/**
 * An item the link opens, or undefined: an item of its list, or of its event. Archived items and
 * archived lists are out of every view; `archived` lets an archived item (never a deleted one) be
 * found, so that a guest can still take back what they had pledged to it.
 */
export async function itemInView(
  tx: Tx,
  link: LinkRow,
  itemId: string,
  { archived = false }: { archived?: boolean } = {},
): Promise<WishRow | undefined> {
  const shown = (id: string) =>
    and(
      eq(schema.wishes.id, id),
      archived ? isNull(schema.wishes.deletedAt) : ne(schema.wishes.status, "archived"),
    );
  const [row] = await tx
    .select({ wish: schema.wishes })
    .from(schema.wishes)
    .innerJoin(schema.wishLists, eq(schema.wishLists.id, schema.wishes.listId))
    // An archived list is out of a list link's view; an event link still finds its archived items
    .where(
      and(
        shown(itemId),
        archived && link.scope === "event" ? undefined : isNull(schema.wishLists.archivedAt),
      ),
    );
  const wish = row?.wish;
  if (!wish) return undefined;
  // A volume is seen through its series (docs/series.md): an archived series hides its volumes
  if (wish.parentId) {
    const [series] = await tx
      .select({ id: schema.wishes.id })
      .from(schema.wishes)
      .where(shown(wish.parentId));
    if (!series) return undefined;
  }
  if (link.scope === "list" && link.listId) return wish.listId === link.listId ? wish : undefined;
  if (link.scope === "event" && link.eventId) {
    // The event selects the series, and with it every volume
    const [selected] = await tx
      .select({ wishId: schema.eventWishes.wishId })
      .from(schema.eventWishes)
      .where(
        and(
          eq(schema.eventWishes.eventId, link.eventId),
          eq(schema.eventWishes.wishId, wish.parentId ?? wish.id),
        ),
      );
    return selected ? wish : undefined;
  }
  return undefined;
}

/** The events of the owner an item is in, for the contribution picker of a list link. */
export async function eventsOfItem(
  tx: Tx,
  ownerId: string,
  wish: { id: string; parentId: string | null },
): Promise<EventRow[]> {
  // A volume is in the events of its series
  const rows = await tx
    .select({ event: schema.events })
    .from(schema.eventWishes)
    .innerJoin(schema.events, eq(schema.events.id, schema.eventWishes.eventId))
    .where(and(eq(schema.eventWishes.wishId, wish.parentId ?? wish.id), eq(schema.events.ownerId, ownerId)))
    .orderBy(asc(schema.events.date));
  return rows.map((row) => row.event);
}

interface ContributionRow {
  id: string;
  wishId: string;
  eventId: string | null;
  contributorId: string | null;
  contributorName: string | null;
  guestName: string | null;
  amountCents: number | null;
  units: number | null;
  message: string | null;
  anonymous: boolean;
  event: EventRow | null;
}

interface ViewData {
  title:
    | {
        kind: "list";
        id: string;
        name: string;
        theme: "neutral" | "christmas" | null;
        icon: string | null;
        imageKey: string | null;
      }
    | {
        kind: "event";
        event: EventRow;
      };
  ownerName: string;
  items: WishRow[];
  /** Item id → the events it is in. */
  itemEvents: Map<string, EventRow[]>;
  /** Item id → its active contributions, every event. */
  contributions: Map<string, ContributionRow[]>;
  /** List id → the list, for the secret of the contributions without an event. */
  lists: Map<string, ListRow>;
}

type ListRow = typeof schema.wishLists.$inferSelect;

async function loadView(db: Database, link: LinkRow): Promise<ViewData> {
  const [owner] = await db
    .select({ displayName: schema.users.displayName })
    .from(schema.users)
    .where(eq(schema.users.id, link.ownerId));
  if (!owner) throw new HttpError(404, "link_not_found");

  let title: ViewData["title"];
  let items: WishRow[];
  if (link.scope === "list" && link.listId) {
    const [list] = await db
      .select()
      .from(schema.wishLists)
      .where(and(eq(schema.wishLists.id, link.listId), isNull(schema.wishLists.archivedAt)));
    if (!list) throw new HttpError(404, "link_not_found");
    title = {
      kind: "list",
      id: list.id,
      name: list.name,
      theme: list.theme,
      icon: list.icon,
      imageKey: list.imageKey,
    };
    items = await db
      .select()
      .from(schema.wishes)
      .where(and(eq(schema.wishes.listId, list.id), ne(schema.wishes.status, "archived")))
      .orderBy(asc(schema.wishes.position), asc(schema.wishes.createdAt));
    // The volumes of an archived series leave with it
    const shown = new Set(items.map((item) => item.id));
    items = items.filter((item) => item.parentId === null || shown.has(item.parentId));
  } else if (link.scope === "event" && link.eventId) {
    const [event] = await db.select().from(schema.events).where(eq(schema.events.id, link.eventId));
    if (!event) throw new HttpError(404, "link_not_found");
    title = { kind: "event", event };
    const rows = await db
      .select({ wish: schema.wishes })
      .from(schema.eventWishes)
      .innerJoin(schema.wishes, eq(schema.wishes.id, schema.eventWishes.wishId))
      // The items of an archived list are out of the event's view too
      .innerJoin(schema.wishLists, eq(schema.wishLists.id, schema.wishes.listId))
      .where(
        and(
          eq(schema.eventWishes.eventId, event.id),
          ne(schema.wishes.status, "archived"),
          isNull(schema.wishLists.archivedAt),
        ),
      )
      .orderBy(asc(schema.eventWishes.position), asc(schema.eventWishes.addedAt));
    items = rows.map((row) => row.wish);
    // A series selected brings its volumes, in their order (docs/series.md)
    const seriesIds = items.filter((item) => item.kind === "series").map((item) => item.id);
    if (seriesIds.length > 0) {
      const volumes = await db
        .select()
        .from(schema.wishes)
        .where(and(inArray(schema.wishes.parentId, seriesIds), ne(schema.wishes.status, "archived")))
        .orderBy(asc(schema.wishes.position), asc(schema.wishes.createdAt));
      items = [...items, ...volumes];
    }
  } else {
    throw new HttpError(404, "link_not_found");
  }

  const ids = items.map((item) => item.id);
  const listIds = [...new Set(items.map((item) => item.listId))];
  const lists = new Map<string, ListRow>();
  if (listIds.length > 0) {
    for (const row of await db.select().from(schema.wishLists).where(inArray(schema.wishLists.id, listIds))) {
      lists.set(row.id, row);
    }
  }
  const itemEvents = new Map<string, EventRow[]>();
  const contributions = new Map<string, ContributionRow[]>();
  if (ids.length > 0) {
    const links = await db
      .select({ wishId: schema.eventWishes.wishId, event: schema.events })
      .from(schema.eventWishes)
      .innerJoin(schema.events, eq(schema.events.id, schema.eventWishes.eventId))
      .where(and(inArray(schema.eventWishes.wishId, ids), eq(schema.events.ownerId, link.ownerId)))
      .orderBy(asc(schema.events.date));
    for (const row of links) {
      itemEvents.set(row.wishId, [...(itemEvents.get(row.wishId) ?? []), row.event]);
    }
    // A volume is in the events of its series
    for (const item of items) {
      if (item.parentId) itemEvents.set(item.id, itemEvents.get(item.parentId) ?? []);
    }
    const rows = await db
      .select({
        id: schema.contributions.id,
        wishId: schema.contributions.wishId,
        eventId: schema.contributions.eventId,
        contributorId: schema.contributions.contributorId,
        contributorName: schema.users.displayName,
        guestName: schema.contributions.guestName,
        amountCents: schema.contributions.amountCents,
        units: schema.contributions.units,
        message: schema.contributions.message,
        anonymous: schema.contributions.anonymous,
        event: schema.events,
      })
      .from(schema.contributions)
      .leftJoin(schema.events, eq(schema.events.id, schema.contributions.eventId))
      .leftJoin(schema.users, eq(schema.users.id, schema.contributions.contributorId))
      .where(and(inArray(schema.contributions.wishId, ids), eq(schema.contributions.status, "active")))
      .orderBy(asc(schema.contributions.createdAt));
    for (const row of rows) {
      contributions.set(row.wishId, [...(contributions.get(row.wishId) ?? []), row]);
    }
  }
  return { title, ownerName: owner.displayName, items, itemEvents, contributions, lists };
}

/**
 * The funding of an item, or null when the viewer may not see it. The single rule decides, for
 * every secret that covers the item: its events, and the item itself for the contributions made
 * without an event (lifted when the owner marks it received). One kept secret hides the whole
 * funding, since totals and states would give it away.
 */
function publicFunding(
  wish: WishRow,
  list: ListRow | undefined,
  events: EventRow[],
  contributions: ContributionRow[],
  context: { viewer: ViewerRole; sessionUserId: string | null; now: Date; open: boolean; eventId?: string },
) {
  const { viewer, sessionUserId, now, open, eventId } = context;
  // Every secret that covers this item: its events, the events of its contributions, and the item
  // itself for the contributions without an event, or when it is in no event at all
  const relevant = new Map<string, SecretState>();
  for (const event of events) relevant.set(event.id, revealState(event));
  for (const contribution of contributions) {
    if (contribution.event) relevant.set(contribution.event.id, revealState(contribution.event));
  }
  if (events.length === 0 || contributions.some((contribution) => contribution.eventId === null)) {
    // A list that cannot be found keeps the secret
    relevant.set(
      "item",
      list ? itemSecret(wish, list) : { mode: "manual", itemReceived: false, listRevealedAt: null },
    );
  }
  const visible = [...relevant.values()].every((state) => canSeeContributions(viewer, state, now));
  if (!visible) return null;

  const funding = contributions.map((contribution) => ({
    eventId: contribution.eventId,
    status: "active" as const,
    amountCents: contribution.amountCents === null ? null : cents(contribution.amountCents),
    units: contribution.units,
  }));
  const wishFunding = {
    kind: wish.kind,
    repeatable: wish.repeatable,
    targetCents: wish.targetCents === null ? null : cents(wish.targetCents),
    quantity: wish.quantity,
    priceCents: wish.priceCents === null ? null : cents(wish.priceCents),
  };
  const total = totalFunded(funding);
  const target = amountTarget(wishFunding);
  const byAmounts = {
    totalCents: total,
    remainingCents: target === null ? null : remainingToFund(target, total),
    overshootCents: target === null ? null : overshoot(target, total),
    byEvent: [...fundingByEvent(funding)].map(([id, amountCents]) => ({ eventId: id, amountCents })),
  };
  return {
    state: itemState(wishFunding, funding, eventId),
    progress: progress(wishFunding, funding),
    ...(wish.kind === "pool"
      ? byAmounts
      : // A gift shared by amounts also says how much is gathered and what is left of its price
        { reservedUnits: reservedUnits(funding), ...(takesShares(wishFunding) ? byAmounts : {}) }),
    ...(wish.repeatable ? { timesGiven: timesGiven(funding) } : {}),
    // Names only, none for an anonymous contribution, and only one's own on an open link: amounts
    // and messages stay with their author
    contributors: contributions.map((contribution) => {
      const mine = sessionUserId !== null && contribution.contributorId === sessionUserId;
      return {
        name: giverNameShown({
          openLink: open,
          anonymous: contribution.anonymous,
          mine,
          name: contribution.contributorName ?? contribution.guestName,
        }),
        mine,
      };
    }),
    mine: contributions
      .filter((contribution) => sessionUserId !== null && contribution.contributorId === sessionUserId)
      .map((contribution) => ({
        id: contribution.id,
        eventId: contribution.eventId,
        amountCents: contribution.amountCents,
        units: contribution.units,
        message: contribution.message,
        anonymous: contribution.anonymous,
      })),
  };
}

const publicEvent = (event: EventRow, now: Date) => ({
  id: event.id,
  name: event.name,
  kind: event.kind,
  date: event.date,
  // Contributions close when the owner lifts the secret
  open: !isSecretLifted(revealState(event), now),
});

/**
 * What a guest sees through their link. The order is the owner's, never the funding state: the
 * public view sorts complete items last itself, so that the owner's view gives nothing away.
 */
/** The steps the guests see: only those still on their way, never why a link failed. */
function liveStage(wish: WishRow): "reading" | "images" | null {
  const stage = stageOf(wish.enrichment, wish.enrichmentStep);
  return isLive(stage) ? (stage as "reading" | "images") : null;
}

export const viewRoutes: FastifyPluginAsync<{
  db: Database;
  now: () => Date;
  images: Images | null;
}> = async (app, { db, now, images }) => {
  /** What changed, in a few bytes: the page asks it while items are completed (docs/live-updates.md). */
  app.get("/live", async (request, reply) => {
    const { link } = shareOf(request);
    reply.header("cache-control", "private, no-store");
    if (link.scope === "list" && link.listId) {
      const [list] = await db
        .select({ id: schema.wishLists.id })
        .from(schema.wishLists)
        .where(and(eq(schema.wishLists.id, link.listId), isNull(schema.wishLists.archivedAt)));
      if (!list) throw new HttpError(404, "link_not_found");
      return listLive(db, list.id);
    }
    if (link.scope === "event" && link.eventId) return eventLive(db, link.eventId);
    throw new HttpError(404, "link_not_found");
  });

  app.get("/view", async (request) => {
    const { link, open, viewer, sessionUser } = shareOf(request);
    const at = now();
    const data = await loadView(db, link);
    const pictures = await imagesOf(db, images, data.items);
    const eventId = data.title.kind === "event" ? data.title.event.id : undefined;
    const events = new Map<string, EventRow>();
    if (data.title.kind === "event") events.set(data.title.event.id, data.title.event);
    else for (const list of data.itemEvents.values()) for (const event of list) events.set(event.id, event);

    return {
      audience: link.audience,
      // The open link of a public list: the page greets everyone, and names nobody else
      open,
      scope: link.scope,
      viewer,
      owner: { displayName: data.ownerName },
      me: sessionUser ? { displayName: sessionUser.displayName } : null,
      list:
        data.title.kind === "list"
          ? {
              id: data.title.id,
              name: data.title.name,
              theme: data.title.theme,
              // Its icon or the owner's image (docs/list-pictures.md), signed thumbnails only
              ...listPictureOf(images, data.title),
            }
          : null,
      event: data.title.kind === "event" ? publicEvent(data.title.event, at) : null,
      events: [...events.values()].map((event) => publicEvent(event, at)),
      items: data.items.map((wish) => {
        const itemEvents = data.itemEvents.get(wish.id) ?? [];
        return {
          id: wish.id,
          kind: wish.kind,
          // The series it is a volume of (docs/series.md): the page shows it inside its card
          parentId: wish.parentId,
          repeatable: wish.repeatable,
          title: wish.title,
          url: wish.url,
          notes: wish.notes,
          // Signed thumbnails only: the guests never learn where the files are
          image: pictures.get(wish.id) ?? null,
          // Being completed from its link: the page follows it live (docs/live-updates.md)
          stage: liveStage(wish),
          priceCents: wish.priceCents,
          targetCents: wish.targetCents,
          quantity: wish.quantity,
          status: wish.status,
          eventIds: itemEvents.map((event) => event.id),
          funding: publicFunding(
            wish,
            data.lists.get(wish.listId),
            itemEvents,
            data.contributions.get(wish.id) ?? [],
            {
              viewer,
              sessionUserId: sessionUser?.id ?? null,
              now: at,
              open,
              ...(eventId ? { eventId } : {}),
            },
          ),
        };
      }),
    };
  });
};
