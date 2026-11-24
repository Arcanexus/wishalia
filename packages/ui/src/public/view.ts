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

const euros = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const wholeEuros = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

/** « 49,90 € », or « 120 € » for a whole amount. */
export const formatEuros = (cents: number) =>
  cents % 100 === 0 ? wholeEuros.format(cents / 100) : euros.format(cents / 100);

const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "UTC" });
/** An event's day (YYYY-MM-DD): « jeudi 24 décembre 2026 ». */
export const formatDay = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

/** « Paul », « Paul et Jeanne », « Paul, Jeanne et Léa ». */
export function joinNames(names: readonly string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} et ${names.at(-1)}`;
}

/** Who gave, in words: names first, then how many chose to stay anonymous. */
export function givers(funding: Funding): string {
  const named = [...new Set(funding.contributors.flatMap((c) => (c.name ? [c.name] : [])))];
  const anonymous = funding.contributors.filter((c) => !c.name).length;
  const parts = [...named];
  if (anonymous > 0)
    parts.push(anonymous === 1 ? "une personne discrète" : `${anonymous} personnes discrètes`);
  return joinNames(parts);
}

/** The line that says where an item stands, for a guest. Null when nothing is to say. */
export function standing(item: PublicItem): string | null {
  if (item.status === "received") return "Déjà reçu : merci !";
  const funding = item.funding;
  if (!funding) return null;
  const who = givers(funding);
  switch (item.kind) {
    case "unique":
      if (item.repeatable) {
        return funding.timesGiven
          ? `Déjà offert ${funding.timesGiven === 1 ? "une fois" : `${funding.timesGiven} fois`}, et peut l'être encore.`
          : "Libre, et peut être offert à chaque occasion.";
      }
      return funding.state === "complete" ? (who ? `Réservé par ${who}.` : "Déjà réservé.") : "Libre.";
    case "quantity": {
      const wanted = item.quantity ?? 1;
      const taken = funding.reservedUnits ?? 0;
      if (taken >= wanted) return who ? `Tout est réservé, par ${who}.` : "Tout est réservé.";
      if (taken === 0) return wanted === 1 ? "Libre." : `${wanted} à offrir, aucun réservé pour l'instant.`;
      return `${taken} sur ${wanted} déjà réservé${taken > 1 ? "s" : ""}${who ? `, par ${who}` : ""}.`;
    }
    case "pool": {
      const total = funding.totalCents ?? 0;
      if (total === 0)
        return item.targetCents
          ? `Cagnotte de ${formatEuros(item.targetCents)}, à lancer.`
          : "Cagnotte à lancer.";
      const reached = item.targetCents
        ? `${formatEuros(total)} réunis sur ${formatEuros(item.targetCents)}`
        : `${formatEuros(total)} réunis`;
      const tail =
        funding.overshootCents && funding.overshootCents > 0
          ? ` : objectif atteint, ${formatEuros(funding.overshootCents)} en excédent`
          : funding.remainingCents
            ? ` : il manque ${formatEuros(funding.remainingCents)}`
            : "";
      return `${reached}${tail}${who ? `, avec ${who}` : ""}.`;
    }
  }
}

/** The page's heading and what it is about. */
export function heading(view: { list: { name: string } | null; event: PublicEvent | null }): string {
  return view.event?.name ?? view.list?.name ?? "Liste de souhaits";
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
  return item.kind === "pool" || unitsLeft(item) > 0;
}

/** The button that opens the form, and sends it. */
export function giveLabel(item: PublicItem): string {
  if (item.kind === "pool") return "Je participe";
  return item.kind === "quantity" && unitsLeft(item) > 1 ? "J'en réserve" : "Je le réserve";
}

const giveErrors: Record<string, string> = {
  already_reserved: "Quelqu'un vient de le réserver. Regardez les autres envies !",
  not_enough_left: "Il n'en reste plus autant : choisissez un nombre plus petit.",
  amount_required: "Indiquez un montant, par exemple 20 ou 12,50.",
  units_required: "Indiquez combien vous en offrez.",
  name_required: "Indiquez votre prénom, pour que vos proches sachent qui s'en occupe.",
  too_long: "Le prénom fait 60 caractères au plus, et le mot 500.",
  event_closed: "Cette occasion est passée : on ne peut plus y participer.",
  item_closed: "Cette envie n'attend plus de cadeau.",
  list_closed: "Cette envie n'attend plus de cadeau.",
  invalid_request: "Vérifiez ce que vous avez écrit, puis réessayez.",
};

/** What went wrong, in plain words. */
export const giveError = (code: string) =>
  giveErrors[code] ?? "Ça n'a pas marché. Réessayez dans un instant.";

const withdrawErrors: Record<string, string> = {
  event_closed: "L'occasion est passée : ce cadeau ne peut plus être retiré.",
  item_closed: "Cette envie est déjà reçue : ce cadeau ne peut plus être retiré.",
  list_closed: "Le secret est levé : ce cadeau ne peut plus être retiré.",
};

export const withdrawError = (code: string) =>
  withdrawErrors[code] ?? "Ça n'a pas marché. Réessayez dans un instant.";

/** One of the person's own gifts, in words: « Vous participez pour 20 € ». */
export function myGiftLine(gift: MyGift, item: PublicItem): string {
  if (gift.amountCents) return `Vous participez pour ${formatEuros(gift.amountCents)}.`;
  if (item.kind === "quantity" && gift.units) {
    return gift.units === 1 ? "Vous en réservez un." : `Vous en réservez ${gift.units}.`;
  }
  return "Vous l'avez réservé.";
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
 * the target and the overshoot past it. Null when there is nothing to draw.
 */
export function poolBar(item: PublicItem, events: readonly PublicEvent[]): PoolBar | null {
  const funding = item.funding;
  if (item.kind !== "pool" || !funding) return null;
  const total = funding.totalCents ?? 0;
  const target = item.targetCents ?? 0;
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
        label: part.eventId ? (names.get(part.eventId) ?? "Une autre occasion") : "Sans occasion",
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

const count = (n: number, one: string, many: string) => `${n} ${n > 1 ? many : one}`;

export const gaugeLine = ({ complete, inProgress, free }: Gauge) =>
  `${count(complete, "complet", "complets")}, ${count(inProgress, "en cours", "en cours")}, ${count(free, "libre", "libres")}.`;

/** One or two letters for an avatar: « Paul » → « P », « Jean Dupont » → « JD ». */
export function initials(name: string | null): string {
  if (!name) return "?";
  const words = name
    .trim()
    .split(/[\s-]+/u)
    // « Camille (exemple) » → « C »: only words that start with a letter
    .filter((word) => /^\p{L}/u.test(word));
  return (
    words
      .slice(0, 2)
      .map((word) => [...word][0]?.toLocaleUpperCase("fr-FR") ?? "")
      .join("") || "?"
  );
}
