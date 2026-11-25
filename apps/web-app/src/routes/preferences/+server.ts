import { redirect } from "@sveltejs/kit";
import { nextMode } from "@wishalia/domain";
import { parseLocale } from "@wishalia/i18n";

import { apiFetch, safeReturnPath } from "#lib/server/api.ts";
import { LOCALE_COOKIE, MODE_COOKIE, writePreference } from "#lib/server/preferences.ts";

import type { RequestHandler } from "./$types";

/**
 * The header buttons: the next mode (light, dark or as the device, docs/branding.md), or another
 * language (docs/i18n.md) when the form names one. A plain form, so it works before the page's
 * JavaScript has loaded; SvelteKit checks the form's origin. The choice goes on the device, and
 * with the account when the person is signed in.
 */
export const POST: RequestHandler = async (event) => {
  const { request, cookies, locals, url } = event;
  const form = await request.formData();
  const secure = url.protocol === "https:";
  const locale = parseLocale(form.get("langue"));
  let patch: { mode: string } | { locale: string };
  if (locale) {
    writePreference(cookies, LOCALE_COOKIE, locale, secure);
    patch = { locale };
  } else {
    const mode = nextMode(locals.mode);
    writePreference(cookies, MODE_COOKIE, mode, secure);
    patch = { mode };
  }
  // Signed out (the sign-in page), the API answers 401: the device keeps the choice alone
  if (request.headers.has("cookie")) {
    await apiFetch(event, "/manage/me", { method: "PATCH", body: patch }).catch(() => undefined);
  }
  redirect(303, safeReturnPath(form.get("retour")?.toString() ?? null));
};
