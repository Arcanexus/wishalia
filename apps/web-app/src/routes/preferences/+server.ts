import { redirect } from "@sveltejs/kit";
import { displayChange } from "@wishalia/domain";
import { parseLocale } from "@wishalia/i18n";

import { apiFetch, safeReturnPath } from "#lib/server/api.ts";
import { LOCALE_COOKIE, MODE_COOKIE, THEME_COOKIE, writePreference } from "#lib/server/preferences.ts";

import type { RequestHandler } from "./$types";

/**
 * The header's display menu (docs/branding.md, docs/i18n.md): a mode (light, dark or as the
 * device), a theme or a language, as the form names it; without a name, the next mode. A plain
 * form, so it works before the page's JavaScript has loaded; SvelteKit checks the form's origin.
 * The choice goes on the device, and with the account when the person is signed in.
 */
export const POST: RequestHandler = async (event) => {
  const { request, cookies, locals, url } = event;
  const form = await request.formData();
  const secure = url.protocol === "https:";
  const locale = parseLocale(form.get("langue"));
  let patch: { mode: string } | { theme: string } | { locale: string };
  if (locale) {
    writePreference(cookies, LOCALE_COOKIE, locale, secure);
    patch = { locale };
  } else {
    patch = displayChange(locals.mode, { mode: form.get("mode"), theme: form.get("theme") });
    if ("mode" in patch) writePreference(cookies, MODE_COOKIE, patch.mode, secure);
    else writePreference(cookies, THEME_COOKIE, patch.theme, secure);
  }
  // Signed out (the sign-in page), the API answers 401: the device keeps the choice alone
  if (request.headers.has("cookie")) {
    await apiFetch(event, "/manage/me", { method: "PATCH", body: patch }).catch(() => undefined);
  }
  redirect(303, safeReturnPath(form.get("retour")?.toString() ?? null));
};
