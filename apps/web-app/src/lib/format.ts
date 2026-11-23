import type { EventKind } from "./types.ts";

export const EVENT_KINDS: readonly { value: EventKind; label: string }[] = [
  { value: "birthday", label: "Anniversaire" },
  { value: "christmas", label: "Noël" },
  { value: "other", label: "Autre" },
];

export const eventKindLabel = (kind: EventKind) =>
  EVENT_KINDS.find((entry) => entry.value === kind)?.label ?? "Autre";

const day = new Intl.DateTimeFormat("fr-FR", { dateStyle: "full", timeZone: "UTC" });
const shortDay = new Intl.DateTimeFormat("fr-FR", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

/** An event's day (YYYY-MM-DD), « samedi 24 décembre 2026 ». */
export const formatDay = (date: string) => day.format(new Date(`${date}T00:00:00Z`));

/**
 * The day from which the secret can be lifted. It opens at midnight UTC, the end of the event day
 * plus the delay: the day shown is that one.
 */
export const formatAvailable = (iso: string) => shortDay.format(new Date(iso));

/** Today, YYYY-MM-DD, to tell upcoming events from past ones. */
export const today = (now = new Date()) => now.toISOString().slice(0, 10);
