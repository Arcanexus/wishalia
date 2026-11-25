import type { Locale } from "../locales.js";
import { mail as en } from "./en/mail.js";
import { mail as fr } from "./fr/mail.js";

export type MailMessages = typeof fr;

const catalogs: Record<Locale, MailMessages> = { fr, en };

/** The emails, in one language. */
export const mailMessages = (locale: Locale): MailMessages => catalogs[locale];
