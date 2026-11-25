import type { Locale } from "../locales.js";
import { app as en } from "./en/app.js";
import { app as fr } from "./fr/app.js";

export type AppMessages = typeof fr;

const catalogs: Record<Locale, AppMessages> = { fr, en };

/** The management app, in one language. */
export const appMessages = (locale: Locale): AppMessages => catalogs[locale];
