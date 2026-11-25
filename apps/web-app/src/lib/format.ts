import type { EventKind } from "./types.ts";

/** The kinds of event, in the order of the form; their names are in the catalog (app.eventKinds). */
export const EVENT_KINDS: readonly EventKind[] = ["birthday", "christmas", "other"];

/** Today, YYYY-MM-DD, to tell upcoming events from past ones. */
export const today = (now = new Date()) => now.toISOString().slice(0, 10);
