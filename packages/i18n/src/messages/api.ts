import type { Locale } from "../locales.js";
import { api as en } from "./en/api.js";
import { api as fr } from "./fr/api.js";

export type ApiMessages = typeof fr;

const catalogs: Record<Locale, ApiMessages> = { fr, en };

/** What the API writes into the data, in one language. */
export const apiMessages = (locale: Locale): ApiMessages => catalogs[locale];
