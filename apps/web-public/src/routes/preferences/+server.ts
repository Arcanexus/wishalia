import { redirect } from "@sveltejs/kit";
import { nextMode } from "@wishalia/domain";
import { parseLocale } from "@wishalia/i18n";

import { LOCALE_COOKIE, MODE_COOKIE, safeReturnPath, writePreference } from "#lib/server/preferences.ts";

import type { RequestHandler } from "./$types";

/**
 * The header buttons: the next mode (light, dark or as the device), or another language when the
 * form names one (docs/i18n.md). A plain form, so it works before the page's JavaScript has
 * loaded; SvelteKit checks the form's origin. Guests have no account here: the choice stays on
 * the device.
 */
export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
  const form = await request.formData();
  const secure = url.protocol === "https:";
  const locale = parseLocale(form.get("langue"));
  if (locale) writePreference(cookies, LOCALE_COOKIE, locale, secure);
  else writePreference(cookies, MODE_COOKIE, nextMode(locals.mode), secure);
  redirect(303, safeReturnPath(form.get("retour")?.toString() ?? null));
};
