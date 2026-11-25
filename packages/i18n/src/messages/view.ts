import type { Locale } from "../locales.js";
import { view as en } from "./en/view.js";
import { view as fr } from "./fr/view.js";

export type ViewMessages = typeof fr;

const catalogs: Record<Locale, ViewMessages> = { fr, en };

/** The guests' view, in one language. */
export const viewMessages = (locale: Locale): ViewMessages => catalogs[locale];
