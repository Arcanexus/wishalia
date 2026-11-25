import type { Locale } from "../locales.js";
import { common as en } from "./en/common.js";
import { common as fr } from "./fr/common.js";

export type CommonMessages = typeof fr;

const catalogs: Record<Locale, CommonMessages> = { fr, en };

/** What both frontends share, in one language. */
export const commonMessages = (locale: Locale): CommonMessages => catalogs[locale];
