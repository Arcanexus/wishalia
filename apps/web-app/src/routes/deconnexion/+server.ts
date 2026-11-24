import { redirect } from "@sveltejs/kit";

import { apiFetch, forwardSetCookies, safeReturnPath } from "#lib/server/api.ts";

import type { RequestHandler } from "./$types";

/**
 * Signs out on the API (the session ends there) and clears its cookie in the browser. With
 * ?retour=, the sign-in page then goes back there: « reconnect, then add your passkey ».
 */
export const POST: RequestHandler = async (event) => {
  const response = await apiFetch(event, "/auth/sign-out", { method: "POST", body: {} });
  forwardSetCookies(event.cookies, response);
  const back = event.url.searchParams.get("retour");
  redirect(
    303,
    back ? `/connexion?retour=${encodeURIComponent(safeReturnPath(back))}` : "/connexion?au-revoir",
  );
};
