import { formatters, type Locale } from "@wishalia/i18n";
import { viewMessages } from "@wishalia/i18n/messages/view";

import type { Funding, MyGift, PublicEvent, PublicItem } from "./types.ts";

/**
 * What the guests' page shows, as pure functions. The API gives the owner's order and never sorts
 * by funding (the owner's view must give nothing away): the page puts what is still to give first.
 */

const done = (item: PublicItem) => item.status === "received" || item.funding?.state === "complete";

/** Open items first in the owner's order, then the complete ones, then the received ones. */
export function sortForGuests(items: readonly PublicItem[]): PublicItem[] {
  const rank = (item: PublicItem) => (item.status === "received" ? 2 : done(item) ? 1 : 0);
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => rank(a.item) - rank(b.item) || a.index - b.index)
    .map(({ item }) => item);
}

/** The words and formats of one language. */
const words = (locale: Locale) => ({ m: viewMessages(locale), f: formatters(locale) });

/** « 49,90 € », or « 120 € » for a whole amount (« €49.90 », « €120 » in English). */
export const formatEuros = (cents: number, locale: Locale) => formatters(locale).money(cents);

/** An event's day (YYYY-MM-DD): « jeudi 24 décembre 2026 ». */
export const formatDay = (date: string, locale: Locale) => formatters(locale).day(date);

/** « Paul », « Paul et Jeanne », « Paul, Jeanne et Léa ». */
export const joinNames = (names: readonly string[], locale: Locale): string => formatters(locale).list(names);

/** Who gave, in words: names first, then how many chose to stay anonymous. */
export function givers(funding: Funding, locale: Locale): string {
  const named = [...new Set(funding.contributors.flatMap((c) => (c.name ? [c.name] : [])))];
  const anonymous = funding.contributors.filter((c) => !c.name).length;
  const parts = [...named];
  if (anonymous > 0) parts.push(viewMessages(locale).discreet(anonymous));
  return joinNames(parts, locale);
}

/**
 * Whether guests may share this gift by amounts, each giving part of it, with or without a price
 * (the API's rule: `takesShares` in @wishalia/domain).
 */
export const takesShares = (item: PublicItem): boolean => item.kind === "unique" && !item.repeatable;

/** A gift's price, when it has one: shares then go up to it. */
export const priceOf = (item: PublicItem): number | null =>
  item.priceCents && item.priceCents > 0 ? item.priceCents : null;

/** What guests already gave by amounts on a shared gift. */
const sharedCents = (item: PublicItem) => (takesShares(item) ? (item.funding?.totalCents ?? 0) : 0);

/** Whether guests already started sharing this gift: then it can only be completed by amounts. */
export const sharing = (item: PublicItem): boolean => sharedCents(item) > 0;

/** The line that says where an item stands, for a guest. Null when nothing is to say. */
export function standing(item: PublicItem, locale: Locale): string | null {
  const { m, f } = words(locale);
  if (item.status === "received") return m.receivedThanks;
  const funding = item.funding;
  if (!funding) return null;
  const who = givers(funding, locale);
  switch (item.kind) {
    case "unique":
      // Nobody gave yet: the badge says so (see `availability`), no words needed
      if (item.repeatable) return funding.timesGiven ? m.repeatGiven(funding.timesGiven) : null;
      if (sharing(item)) {
        if (funding.state === "complete") return who ? m.sharedBy(who) : m.shared;
        const price = priceOf(item);
        const reached = m.poolReached(f.money(sharedCents(item)), price === null ? null : f.money(price));
        const missing = funding.remainingCents ? m.poolMissing(f.money(funding.remainingCents)) : "";
        return `${reached}${missing}${who ? m.poolWith(who) : ""}.`;
      }
      if (funding.state === "complete") return who ? m.reservedBy(who) : m.reserved;
      return null;
    case "quantity": {
      const wanted = item.quantity ?? 1;
      const taken = funding.reservedUnits ?? 0;
      if (taken >= wanted) return who ? m.allReservedBy(who) : m.allReserved;
      if (taken === 0) return null;
      return m.someReserved(taken, wanted, who);
    }
    case "pool": {
      const total = funding.totalCents ?? 0;
      const target = item.targetCents ? f.money(item.targetCents) : null;
      if (total === 0) return m.poolToStart(target);
      const reached = m.poolReached(f.money(total), target);
      const tail =
        funding.overshootCents && funding.overshootCents > 0
          ? m.poolOvershoot(f.money(funding.overshootCents))
          : funding.remainingCents
            ? m.poolMissing(f.money(funding.remainingCents))
            : "";
      return `${reached}${tail}${who ? m.poolWith(who) : ""}.`;
    }
  }
}

/** Where an item stands, as the card's badge draws it: an icon and a colour, with words for a screen reader. */
export type Availability = "free" | "progress" | "done" | "received";

/** Null when the guest may not see where it stands (the owner, a folded page): no badge then. */
export function availability(item: PublicItem): Availability | null {
  if (item.status === "received") return "received";
  const state = item.funding?.state;
  if (!state) return null;
  if (state === "complete") return "done";
  return state === "free" ? "free" : "progress";
}

/** The page's heading and what it is about. */
export function heading(
  view: { list: { name: string } | null; event: PublicEvent | null },
  locale: Locale,
): string {
  return view.event?.name ?? view.list?.name ?? viewMessages(locale).defaultHeading;
}

/** How many copies of an item are still free (1 for a free gift, 0 when all are taken). */
export function unitsLeft(item: PublicItem): number {
  if (item.kind === "pool") return 0;
  const wanted = item.kind === "quantity" ? Math.max(1, item.quantity ?? 1) : 1;
  // A repeatable item starts again at every occasion: the API counts per event
  if (item.repeatable) return wanted;
  return Math.max(0, wanted - (item.funding?.reservedUnits ?? 0));
}

/** Whether a guest can still give this item something. */
export function canGive(item: PublicItem, view: { viewer: string; event: PublicEvent | null }): boolean {
  if (view.viewer === "owner" || item.status !== "open") return false;
  if (view.event && !view.event.open) return false;
  if (sharing(item)) return item.funding?.state !== "complete";
  return item.kind === "pool" || unitsLeft(item) > 0;
}

/** The button that opens the form: the same on every item, whatever it is (its form asks the rest). */
export const giveLabel = (locale: Locale): string => viewMessages(locale).giveLabel;

/** What went wrong, in plain words. */
export const giveError = (code: string, locale: Locale) => {
  const m = viewMessages(locale);
  return m.giveErrors[code] ?? m.tryAgain;
};

export const withdrawError = (code: string, locale: Locale) => {
  const m = viewMessages(locale);
  return m.withdrawErrors[code] ?? m.tryAgain;
};

/** One of the person's own gifts, in words: « Vous participez pour 20 € ». */
export function myGiftLine(gift: MyGift, item: PublicItem, locale: Locale): string {
  const { m, f } = words(locale);
  if (gift.amountCents) return m.myGiftAmount(f.money(gift.amountCents));
  if (item.kind === "quantity" && gift.units) return m.myGiftUnits(gift.units);
  return m.myGiftReserved;
}

/** A part of a pool's bar: what one event brought, as fractions of the bar's width. */
export interface Segment {
  key: string;
  label: string;
  cents: number;
  start: number;
  width: number;
  /** Which of the bar's colours, by order of the events. */
  tone: number;
}

export interface PoolBar {
  segments: Segment[];
  /** Where the target stands on the bar, 0 to 1; null without a target. */
  target: number | null;
  /** The part past the target, hatched. */
  overshoot: { start: number; width: number } | null;
}

export const TONES = 4;

/**
 * A pool's bar (spec §4): one segment per event, on a scale of max(target, total), with a mark at
 * the target and the overshoot past it. A gift shared by amounts gets the same bar, up to its price.
 * Null when there is nothing to draw.
 */
export function poolBar(item: PublicItem, events: readonly PublicEvent[], locale: Locale): PoolBar | null {
  const m = viewMessages(locale);
  const funding = item.funding;
  if (!funding || !(item.kind === "pool" || sharing(item))) return null;
  const total = funding.totalCents ?? 0;
  const target = (item.kind === "pool" ? item.targetCents : item.priceCents) ?? 0;
  const scale = Math.max(target, total);
  if (scale <= 0) return null;
  const names = new Map(events.map((event) => [event.id, event.name]));
  const parts = funding.byEvent?.length ? funding.byEvent : [{ eventId: null, amountCents: total }];
  let at = 0;
  const segments = parts
    .filter((part) => part.amountCents > 0)
    .map((part, index) => {
      const segment = {
        key: part.eventId ?? "none",
        label: part.eventId ? (names.get(part.eventId) ?? m.otherEvent) : m.noEvent,
        cents: part.amountCents,
        start: at / scale,
        width: part.amountCents / scale,
        tone: index % TONES,
      };
      at += part.amountCents;
      return segment;
    });
  return {
    segments,
    target: target > 0 ? target / scale : null,
    overshoot:
      target > 0 && total > target ? { start: target / scale, width: (total - target) / scale } : null,
  };
}

/** Where an event, or a list, stands (spec §4: « X complets, Y en cours, Z libres »). */
export interface Gauge {
  complete: number;
  inProgress: number;
  free: number;
}

export function gauge(items: readonly PublicItem[]): Gauge | null {
  const counted = items.filter((item) => item.funding !== null || item.status === "received");
  if (counted.length === 0) return null;
  const result: Gauge = { complete: 0, inProgress: 0, free: 0 };
  for (const item of counted) {
    const state = item.status === "received" ? "complete" : item.funding?.state;
    if (state === "complete") result.complete += 1;
    else if (state === "free") result.free += 1;
    else result.inProgress += 1;
  }
  return result;
}

export const gaugeLine = ({ complete, inProgress, free }: Gauge, locale: Locale) => {
  const m = viewMessages(locale);
  return `${m.gaugeComplete(complete)}, ${m.gaugeInProgress(inProgress)}, ${m.gaugeFree(free)}.`;
};

/** One or two letters for an avatar: « Paul » → « P », « Jean Dupont » → « JD ». */
export function initials(name: string | null, locale: Locale = "fr"): string {
  if (!name) return "?";
  const words = name
    .trim()
    .split(/[\s-]+/u)
    // « Camille (exemple) » → « C »: only words that start with a letter
    .filter((word) => /^\p{L}/u.test(word));
  return (
    words
      .slice(0, 2)
      .map((word) => formatters(locale).upper([...word][0] ?? ""))
      .join("") || "?"
  );
}
