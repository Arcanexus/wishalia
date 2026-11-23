import { fail, type RequestEvent } from "@sveltejs/kit";

import type { EventKind, Gift, HistoryEntry } from "#lib/types.ts";

type FormEvent = Pick<RequestEvent, "request">;

const KINDS: readonly EventKind[] = ["birthday", "christmas", "other"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface EventForm {
  name: string;
  kind: EventKind;
  date: string;
  revealDelayDays: number;
}

/**
 * The fields of the event form, checked enough to say what is wrong in plain words; the API
 * checks them again. Returns the fields, or a failure that keeps what was typed.
 */
export async function readEventForm(event: FormEvent, key: "create" | "update") {
  const form = await event.request.formData();
  const values = {
    name: String(form.get("name") ?? "").trim(),
    kind: String(form.get("kind") ?? "other") as EventKind,
    date: String(form.get("date") ?? ""),
    revealDelayDays: String(form.get("revealDelayDays") ?? "3").trim(),
  };
  const delay = Number(values.revealDelayDays);
  const error =
    !values.name || values.name.length > 100
      ? "invalid_name"
      : !DATE.test(values.date) || Number.isNaN(Date.parse(values.date))
        ? "invalid_date"
        : !Number.isInteger(delay) || delay < 0 || delay > 365
          ? "invalid_delay"
          : !KINDS.includes(values.kind)
            ? "invalid_request"
            : null;
  if (error) return { failure: fail(400, { [key]: { error, ...values } }) };
  return { fields: { ...values, revealDelayDays: delay } satisfies EventForm, form };
}

/**
 * Who gave what to an item for one event, from its history: the contributions and reservations
 * of that event, without the withdrawn ones. The API only gives these entries once the secret of
 * the event is lifted (anti-spoil): before, the list is empty.
 */
export function giftsFor(history: readonly HistoryEntry[], eventId: string): Gift[] {
  const withdrawn = new Set(
    history
      .filter((entry) => entry.type === "contribution_withdrawn")
      .map((entry) => entry.payload.contributionId),
  );
  return history
    .filter(
      (entry) =>
        (entry.type === "contribution_added" || entry.type === "reserved") &&
        entry.payload.eventId === eventId &&
        !withdrawn.has(entry.payload.contributionId),
    )
    .map((entry) => ({
      name: typeof entry.payload.name === "string" ? entry.payload.name : null,
      amountCents: typeof entry.payload.amountCents === "number" ? entry.payload.amountCents : null,
      units: typeof entry.payload.units === "number" ? entry.payload.units : null,
    }));
}
