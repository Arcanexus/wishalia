import { redirect } from "@sveltejs/kit";
import { displayChange } from "@wishalia/domain";
import { parseLocale } from "@wishalia/i18n";

import { apiFetch, safeReturnPath } from "#lib/server/api.ts";
import {
  LOCALE_COOKIE,
  MODE_COOKIE,
  TEXT_COOKIE,
  THEME_COOKIE,
  writePreference,
} from "#lib/server/preferences.ts";

import type { RequestHandler } from "./$types";

/**
 * The header's display menu (docs/branding.md, docs/i18n.md): a mode (light, dark or as the
 * device), a theme, a text size or a language, as the form names it; without a name, the next mode. A plain
 * form, so it works before the page's JavaScript has loaded; SvelteKit checks the form's origin.
 * The choice goes on the device, and with the account when the person is signed in.
 */
export const POST: RequestHandler = async (event) => {
  const { request, cookies, locals, url } = event;
  const form = await request.formData();
  const secure = url.protocol === "https:";
  const locale = parseLocale(form.get("langue"));
  let patch: { mode: string } | { theme: string } | { locale: string } | null;
  if (locale) {
    writePreference(cookies, LOCALE_COOKIE, locale, secure);
    patch = { locale };
  } else {
    const change = displayChange(locals.mode, {
      mode: form.get("mode"),
      theme: form.get("theme"),
      text: form.get("texte"),
    });
    if ("mode" in change) writePreference(cookies, MODE_COOKIE, change.mode, secure);
    else if ("theme" in change) writePreference(cookies, THEME_COOKIE, change.theme, secure);
    else writePreference(cookies, TEXT_COOKIE, change.text, secure);
    // The size of the text belongs to the device: a phone and a large screen differ
    patch = "text" in change ? null : change;
  }
  // Signed out (the sign-in page), the API answers 401: the device keeps the choice alone
  if (patch && request.headers.has("cookie")) {
    await apiFetch(event, "/manage/me", { method: "PATCH", body: patch }).catch(() => undefined);
  }
  redirect(303, safeReturnPath(form.get("retour")?.toString() ?? null));
};
