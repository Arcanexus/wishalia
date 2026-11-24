import { redirect } from "@sveltejs/kit";
import { nextMode } from "@wishalia/domain";

import { apiFetch, safeReturnPath } from "#lib/server/api.ts";
import { MODE_COOKIE, writePreference } from "#lib/server/preferences.ts";

import type { RequestHandler } from "./$types";

/**
 * The header button: light, dark or as the device, in turn (docs/branding.md). A plain form, so
 * it works before the page's JavaScript has loaded; SvelteKit checks the form's origin. The
 * choice goes on the device, and with the account when the person is signed in.
 */
export const POST: RequestHandler = async (event) => {
  const { request, cookies, locals, url } = event;
  const form = await request.formData();
  const mode = nextMode(locals.mode);
  writePreference(cookies, MODE_COOKIE, mode, url.protocol === "https:");
  // Signed out (the sign-in page), the API answers 401: the device keeps the choice alone
  if (request.headers.has("cookie")) {
    await apiFetch(event, "/manage/me", { method: "PATCH", body: { mode } }).catch(() => undefined);
  }
  redirect(303, safeReturnPath(form.get("retour")?.toString() ?? null));
};
