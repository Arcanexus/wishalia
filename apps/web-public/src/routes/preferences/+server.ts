import { redirect } from "@sveltejs/kit";
import { displayChange } from "@wishalia/domain";
import { parseLocale } from "@wishalia/i18n";

import {
  LOCALE_COOKIE,
  MODE_COOKIE,
  safeReturnPath,
  THEME_COOKIE,
  writePreference,
} from "#lib/server/preferences.ts";

import type { RequestHandler } from "./$types";

/**
 * The header's display menu: a mode, a theme or a language, as the form names it; without a name,
 * the next mode (docs/i18n.md, docs/branding.md). A plain form, so it works before the page's
 * JavaScript has loaded; SvelteKit checks the form's origin. Guests have no account here: the
 * choice stays on the device.
 */
export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
  const form = await request.formData();
  const secure = url.protocol === "https:";
  const locale = parseLocale(form.get("langue"));
  if (locale) writePreference(cookies, LOCALE_COOKIE, locale, secure);
  else {
    const change = displayChange(locals.mode, { mode: form.get("mode"), theme: form.get("theme") });
    if ("mode" in change) writePreference(cookies, MODE_COOKIE, change.mode, secure);
    else writePreference(cookies, THEME_COOKIE, change.theme, secure);
  }
  redirect(303, safeReturnPath(form.get("retour")?.toString() ?? null));
};
