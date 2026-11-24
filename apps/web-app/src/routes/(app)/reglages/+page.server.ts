import { fail } from "@sveltejs/kit";
import { MODE_CHOICES, THEME_CHOICES, type ModeChoice, type ThemeChoice } from "@wishalia/domain";

import { ApiError, apiJson } from "#lib/server/api.ts";
import { deletePasskey, listPasskeys, PASSKEY_NAME_MAX, renamePasskey } from "#lib/server/passkeys.ts";
import { MODE_COOKIE, THEME_COOKIE, writePreference } from "#lib/server/preferences.ts";
import type { ApiToken, Me } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The REST API v1 is on only with its own host (hosts.api): without it, no token to manage. */
const apiOrigin = () => process.env.API_ORIGIN ?? null;

export const load: PageServerLoad = async (event) => {
  const origin = apiOrigin();
  const [passkeys, tokens] = await Promise.all([
    listPasskeys(event),
    origin ? apiJson<ApiToken[]>(event, "/manage/api-tokens") : [],
  ]);
  return { apiOrigin: origin, passkeys, tokens };
};

export const actions: Actions = {
  /** Name, theme and mode: with the account, and on this device at once. */
  display: async (event) => {
    const form = await event.request.formData();
    const displayName = String(form.get("displayName") ?? "").trim();
    const theme = String(form.get("theme") ?? "") as ThemeChoice;
    const mode = String(form.get("mode") ?? "") as ModeChoice;
    if (!displayName || displayName.length > 80) return fail(400, { display: { error: "invalid_name" } });
    if (!THEME_CHOICES.includes(theme) || !MODE_CHOICES.includes(mode)) {
      return fail(400, { display: { error: "invalid_request" } });
    }
    const me = await apiJson<Me>(event, "/manage/me", {
      method: "PATCH",
      body: { displayName, theme, mode },
    });
    const secure = event.url.protocol === "https:";
    writePreference(event.cookies, THEME_COOKIE, me.theme, secure);
    writePreference(event.cookies, MODE_COOKIE, me.mode, secure);
    return { display: { saved: true } };
  },

  /** A personal access token for a script: shown once, only its hash is kept. */
  createToken: async (event) => {
    const form = await event.request.formData();
    const name = String(form.get("name") ?? "").trim();
    const expiresInDays = Number(form.get("expiresInDays") ?? 90);
    const readOnly = form.get("readOnly") === "on";
    const values = { name, expiresInDays, readOnly };
    if (!name || name.length > 60) return fail(400, { token: { error: "invalid_name", ...values } });
    if (!Number.isInteger(expiresInDays) || expiresInDays < 1 || expiresInDays > 365) {
      return fail(400, { token: { error: "invalid_days", ...values } });
    }
    try {
      const created = await apiJson<ApiToken & { token: string }>(event, "/manage/api-tokens", {
        method: "POST",
        body: values,
      });
      return { token: { created: { name: created.name, token: created.token } } };
    } catch (failure) {
      if (failure instanceof ApiError)
        return fail(failure.status, { token: { error: failure.code, ...values } });
      throw failure;
    }
  },

  revokeToken: async (event) => {
    const id = String((await event.request.formData()).get("id") ?? "");
    if (!UUID.test(id)) return fail(400, { revoke: { error: "invalid_request" } });
    try {
      const token = await apiJson<ApiToken>(event, `/manage/api-tokens/${id}/revoke`, { method: "POST" });
      return { revoke: { name: token.name } };
    } catch (failure) {
      if (failure instanceof ApiError) return fail(failure.status, { revoke: { error: failure.code } });
      throw failure;
    }
  },

  /** A clearer name, such as « Téléphone de Marie »: the device only knows its own. */
  renamePasskey: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get("id") ?? "");
    const name = String(form.get("name") ?? "").trim();
    if (!UUID.test(id)) return fail(400, { passkey: { error: "invalid_request" } });
    if (!name || name.length > PASSKEY_NAME_MAX) return fail(400, { passkey: { error: "invalid_name", id } });
    try {
      await renamePasskey(event, id, name);
      return { passkey: { renamed: name } };
    } catch (failure) {
      if (failure instanceof ApiError) return fail(failure.status, { passkey: { error: failure.code, id } });
      throw failure;
    }
  },

  /** For good: that device can no longer sign in, and the magic link remains. */
  deletePasskey: async (event) => {
    const form = await event.request.formData();
    const id = String(form.get("id") ?? "");
    const name = String(form.get("name") ?? "").slice(0, PASSKEY_NAME_MAX);
    if (!UUID.test(id)) return fail(400, { passkey: { error: "invalid_request" } });
    try {
      await deletePasskey(event, id);
      return { passkey: { deleted: name } };
    } catch (failure) {
      if (failure instanceof ApiError) return fail(failure.status, { passkey: { error: failure.code, id } });
      throw failure;
    }
  },
};
