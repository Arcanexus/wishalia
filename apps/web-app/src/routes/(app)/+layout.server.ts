import { nextMode } from "@wishalia/domain";

import { apiJson } from "#lib/server/api.ts";
import {
  LOCALE_COOKIE,
  MODE_COOKIE,
  pageLocale,
  THEME_COOKIE,
  writePreference,
} from "#lib/server/preferences.ts";
import type { Me } from "#lib/types.ts";

import type { LayoutServerLoad } from "./$types";

/**
 * Every page of the app needs a session: without one, apiJson sends the person to /connexion.
 * The display settings of the account win over the device's cookies, which follow them, so that
 * the sign-in page of this device looks the same next time.
 */
export const load: LayoutServerLoad = async (event) => {
  const me = await apiJson<Me>(event, "/manage/me");
  const secure = event.url.protocol === "https:";
  if (event.locals.themeChoice !== me.theme) writePreference(event.cookies, THEME_COOKIE, me.theme, secure);
  if (event.locals.mode !== me.mode) writePreference(event.cookies, MODE_COOKIE, me.mode, secure);
  if (event.locals.localeChoice !== me.locale) {
    if (me.locale === "auto") event.cookies.delete(LOCALE_COOKIE, { path: "/" });
    else writePreference(event.cookies, LOCALE_COOKIE, me.locale, secure);
  }
  event.locals.themeChoice = me.theme;
  event.locals.mode = me.mode;
  event.locals.localeChoice = me.locale;
  event.locals.locale = pageLocale(me.locale, event.request.headers.get("accept-language"));
  return { me, locale: event.locals.locale, mode: me.mode, nextMode: nextMode(me.mode) };
};
