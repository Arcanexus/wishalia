import type { Locale } from "../locales.js";
import { apiMessages } from "./api.js";
import { appMessages } from "./app.js";
import { commonMessages } from "./common.js";
import { mailMessages } from "./mail.js";
import { publicMessages } from "./public.js";
import { viewMessages } from "./view.js";

/** Every catalog, for the CI check (catalog.test.ts). A new catalog goes here too. */
export const CATALOGS: Record<string, (locale: Locale) => unknown> = {
  api: apiMessages,
  app: appMessages,
  common: commonMessages,
  mail: mailMessages,
  public: publicMessages,
  view: viewMessages,
};
