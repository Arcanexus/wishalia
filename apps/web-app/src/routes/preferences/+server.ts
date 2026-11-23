import { redirect } from "@sveltejs/kit";
import { nextMode } from "@wishalia/domain";

import { safeReturnPath } from "#lib/server/api.ts";
import { MODE_COOKIE, writePreference } from "#lib/server/preferences.ts";

import type { RequestHandler } from "./$types";

/**
 * The header button: light, dark or as the device, in turn (docs/branding.md). A plain form, so
 * it works before the page's JavaScript has loaded; SvelteKit checks the form's origin.
 */
export const POST: RequestHandler = async ({ request, cookies, locals, url }) => {
  const form = await request.formData();
  writePreference(cookies, MODE_COOKIE, nextMode(locals.mode), url.protocol === "https:");
  redirect(303, safeReturnPath(form.get("retour")?.toString() ?? null));
};
