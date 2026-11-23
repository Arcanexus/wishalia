import { redirect } from "@sveltejs/kit";

import { apiFetch, forwardSetCookies } from "#lib/server/api.ts";

import type { RequestHandler } from "./$types";

/** Signs out on the API (the session ends there) and clears its cookie in the browser. */
export const POST: RequestHandler = async (event) => {
  const response = await apiFetch(event, "/auth/sign-out", { method: "POST", body: {} });
  forwardSetCookies(event.cookies, response);
  redirect(303, "/connexion?au-revoir");
};
