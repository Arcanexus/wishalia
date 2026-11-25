import { fail, redirect } from "@sveltejs/kit";

import { genericMeta } from "#lib/meta.ts";
import { appOrigin, loadHome, tokenFromPasted } from "#lib/server/api.ts";

import type { Actions, PageServerLoad } from "./$types";

/**
 * The home page of the public host: a welcome, signing in to manage one's lists or to take part,
 * opening a link one was sent, and the search of the public lists (« Trouver une liste »). Private
 * lists are never here: the API only ever gives the public ones.
 */
export const load: PageServerLoad = async (event) => {
  const query = (event.url.searchParams.get("q") ?? "").slice(0, 200);
  const home = await loadHome(event, query);
  // Who is signed in changes the page
  event.setHeaders({ "cache-control": "private, no-store" });
  const app = appOrigin();
  return {
    meta: genericMeta(process.env.APP_NAME ?? "Wishalia"),
    home,
    searched: query.trim(),
    signInUrl: app ? `${app}/connexion` : null,
    appUrl: app ? `${app}/` : null,
  };
};

export const actions: Actions = {
  /** « Ouvrir mon lien » : the address pasted from a message, or its token alone. */
  open: async (event) => {
    const pasted = String((await event.request.formData()).get("link") ?? "").slice(0, 500);
    const token = tokenFromPasted(pasted);
    if (!token) return fail(400, { open: { error: "invalid_link", link: pasted } });
    redirect(303, `/s/${token}`);
  },
};
