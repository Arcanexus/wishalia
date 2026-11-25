import { fail, redirect } from "@sveltejs/kit";
import { appMessages } from "@wishalia/i18n/messages/app";

import { ApiError, apiFetch, apiJson, forwardSetCookies } from "#lib/server/api.ts";
import type { CreatedShareLink, List, ShareLink, WishEvent } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const load: PageServerLoad = async (event) => {
  const [links, lists, events] = await Promise.all([
    apiJson<ShareLink[]>(event, "/manage/share-links"),
    apiJson<List[]>(event, "/manage/lists"),
    apiJson<WishEvent[]>(event, "/manage/events"),
  ]);
  // From a list or an event page: that one is chosen already
  const liste = event.url.searchParams.get("liste");
  const evenement = event.url.searchParams.get("evenement");
  const preset = evenement ? `event:${evenement}` : liste ? `list:${liste}` : null;
  const m = appMessages(event.locals.locale).share;
  return {
    links,
    targets: [
      ...lists.map((list) => ({ value: `list:${list.id}`, label: m.targetList(list.name) })),
      ...events.map((wishEvent) => ({
        value: `event:${wishEvent.id}`,
        label: m.targetEvent(wishEvent.name),
      })),
    ],
    preset,
  };
};

export const actions: Actions = {
  /**
   * A link per guest or per group. The address is shown once: only its hash is kept. Making it
   * also marks this device as the owner's, so the public view never spoils them (spec §3).
   */
  create: async (event) => {
    const form = await event.request.formData();
    const target = String(form.get("target") ?? "");
    const audience = String(form.get("audience") ?? "").trim();
    const expires = String(form.get("expires") ?? "");
    const values = { target, audience, expires };
    const [scope, id = ""] = target.split(":");
    if ((scope !== "list" && scope !== "event") || !UUID.test(id)) {
      return fail(400, { create: { error: "invalid_target", ...values } });
    }
    if (!audience || audience.length > 60)
      return fail(400, { create: { error: "invalid_audience", ...values } });
    if (expires && !DATE.test(expires)) return fail(400, { create: { error: "invalid_expires", ...values } });

    const response = await apiFetch(event, "/manage/share-links", {
      method: "POST",
      body: {
        scope,
        ...(scope === "list" ? { listId: id } : { eventId: id }),
        audience,
        // The link works until the end of the chosen day
        expiresAt: expires ? `${expires}T23:59:59Z` : null,
      },
    });
    if (response.status === 401) redirect(303, "/connexion?retour=%2Fpartage");
    const payload = (await response.json().catch(() => null)) as
      (CreatedShareLink & { error?: string }) | null;
    if (!response.ok || !payload) {
      const code =
        payload?.error === "invalid_request" && expires ? "invalid_expires" : (payload?.error ?? "unknown");
      return fail(response.status, { create: { error: code, ...values } });
    }
    forwardSetCookies(event.cookies, response);
    return { created: { id: payload.id, audience: payload.audience, url: payload.url } };
  },

  /** Final: the guest's link then answers like an unknown one. */
  revoke: async (event) => {
    const id = String((await event.request.formData()).get("id") ?? "");
    if (!UUID.test(id)) return fail(400, { revoke: { error: "invalid_request" } });
    try {
      const link = await apiJson<ShareLink>(event, `/manage/share-links/${id}/revoke`, { method: "POST" });
      return { revoke: { audience: link.audience } };
    } catch (failure) {
      if (failure instanceof ApiError) return fail(failure.status, { revoke: { error: failure.code } });
      throw failure;
    }
  },
};
