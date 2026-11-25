import type { Locale } from "../locales.js";
import { publicSite as en } from "./en/public.js";
import { publicSite as fr } from "./fr/public.js";

export type PublicMessages = typeof fr;

const catalogs: Record<Locale, PublicMessages> = { fr, en };

/** The public site, in one language. */
export const publicMessages = (locale: Locale): PublicMessages => catalogs[locale];
