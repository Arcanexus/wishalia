import { fail, redirect } from "@sveltejs/kit";

import { apiFetch, forwardSetCookies, safeReturnPath } from "#lib/server/api.ts";

import type { Actions, PageServerLoad } from "./$types";

// Loose on purpose: the API checks the address, this only catches a slip of the finger
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const returnPath = (url: URL) => safeReturnPath(url.searchParams.get("retour"));

export const load: PageServerLoad = async (event) => {
  // Already signed in: straight to where the person was going
  const me = await apiFetch(event, "/manage/me");
  if (me.ok) redirect(303, returnPath(event.url));
  return {
    oidc: Boolean(process.env.OIDC_ISSUER),
    oidcName: process.env.OIDC_NAME ?? "SSO",
    failed: event.url.searchParams.has("erreur"),
    // Where a passkey sign-in goes, in the browser: only a path of this app
    returnPath: returnPath(event.url),
    signedOut: event.url.searchParams.has("au-revoir"),
  };
};

export const actions: Actions = {
  /** The magic link (spec §2): an e-mail with a link that signs in, valid a few minutes. */
  email: async (event) => {
    const form = await event.request.formData();
    const email = String(form.get("email") ?? "").trim();
    if (email.length > 254 || !EMAIL.test(email)) return fail(400, { email, error: "invalid_email" });
    const response = await apiFetch(event, "/auth/sign-in/magic-link", {
      method: "POST",
      body: { email, callbackURL: returnPath(event.url), errorCallbackURL: "/connexion?erreur" },
    });
    if (response.status === 429) return fail(429, { email, error: "too_many" });
    if (!response.ok) return fail(503, { email, error: "unavailable" });
    return { sent: email };
  },

  /** Single sign-on: the API gives the provider's address and a state cookie, then the provider calls back. */
  oidc: async (event) => {
    const response = await apiFetch(event, "/auth/sign-in/social", {
      method: "POST",
      body: { provider: "oidc", callbackURL: returnPath(event.url), errorCallbackURL: "/connexion?erreur" },
    });
    const payload = (await response.json().catch(() => null)) as { url?: unknown } | null;
    const target = typeof payload?.url === "string" ? URL.parse(payload.url) : null;
    if (!response.ok || !target || (target.protocol !== "https:" && target.protocol !== "http:")) {
      return fail(503, { error: "unavailable" });
    }
    forwardSetCookies(event.cookies, response);
    // The provider's sign-in page: the only address outside the app this page sends to, given by
    // the API (never by the browser) and checked above
    redirect(303, target.href, { external: true });
  },
};
