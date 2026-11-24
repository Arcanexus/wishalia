import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../test/event.ts";
import { actions, load } from "./(app)/reglages/+page.server.ts";

const TOKEN = "5b1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const OTHER = "6c2f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const run = (handler: unknown, event: unknown) =>
  outcome(() => (handler as (event: unknown) => unknown)(event));
const display = { displayName: " Alex ", theme: "neutral", mode: "dark" };

describe("the settings page", () => {
  it("lists the API tokens only when the API v1 is on", async () => {
    const api = fakeApi({
      "GET /manage/api-tokens": () => json([{ id: TOKEN }]),
      "GET /auth/passkey/list-user-passkeys": () => json([]),
    });
    vi.stubEnv("API_ORIGIN", undefined);
    expect((await run(load, fakeEvent().event)).value).toEqual({ apiOrigin: null, passkeys: [], tokens: [] });
    expect(api.calls.map((call) => call.path)).not.toContain("/manage/api-tokens");
    vi.stubEnv("API_ORIGIN", "https://api.wishalia.test");
    expect((await run(load, fakeEvent().event)).value).toMatchObject({
      apiOrigin: "https://api.wishalia.test",
      tokens: [{ id: TOKEN }],
    });
  });

  it("saves the name and display settings with the account, and on this device", async () => {
    const api = fakeApi({
      "PATCH /manage/me": (body) => json({ id: "u", email: "a@x.test", ...(body as object) }),
    });
    const { event, setCookies } = fakeEvent({ form: display });
    expect((await run(actions.display, event)).value).toEqual({ display: { saved: true } });
    expect(api.calls[0]?.body).toEqual({ displayName: "Alex", theme: "neutral", mode: "dark" });
    expect(setCookies.map((cookie) => [cookie.name, cookie.value])).toEqual([
      ["wishalia.theme", "neutral"],
      ["wishalia.mode", "dark"],
    ]);
  });

  it("refuses an empty name or an unknown setting without calling the API", async () => {
    const api = fakeApi({});
    expect(
      (await run(actions.display, fakeEvent({ form: { ...display, displayName: "" } }).event)).value,
    ).toMatchObject({
      status: 400,
      data: { display: { error: "invalid_name" } },
    });
    expect(
      (await run(actions.display, fakeEvent({ form: { ...display, theme: "pink" } }).event)).value,
    ).toMatchObject({
      status: 400,
      data: { display: { error: "invalid_request" } },
    });
    expect(api.calls).toHaveLength(0);
  });

  it("makes a token and gives it once", async () => {
    const api = fakeApi({
      "POST /manage/api-tokens": (body) => json({ id: TOKEN, ...(body as object), token: "wsh_secret" }, 201),
    });
    const { event } = fakeEvent({ form: { name: " Home Assistant ", expiresInDays: "30", readOnly: "on" } });
    expect((await run(actions.createToken, event)).value).toEqual({
      token: { created: { name: "Home Assistant", token: "wsh_secret" } },
    });
    expect(api.calls[0]?.body).toEqual({ name: "Home Assistant", expiresInDays: 30, readOnly: true });
  });

  it("explains a wrong token form, and passes the API's refusal on", async () => {
    const api = fakeApi({ "POST /manage/api-tokens": () => json({ error: "invalid_request" }, 400) });
    expect(
      (await run(actions.createToken, fakeEvent({ form: { name: "", expiresInDays: "30" } }).event)).value,
    ).toMatchObject({
      data: { token: { error: "invalid_name" } },
    });
    expect(
      (await run(actions.createToken, fakeEvent({ form: { name: "x", expiresInDays: "400" } }).event)).value,
    ).toMatchObject({
      data: { token: { error: "invalid_days" } },
    });
    expect(api.calls).toHaveLength(0);
    expect(
      (await run(actions.createToken, fakeEvent({ form: { name: "x", expiresInDays: "30" } }).event)).value,
    ).toMatchObject({
      status: 400,
      data: { token: { error: "invalid_request", readOnly: false } },
    });
  });

  it("revokes a token", async () => {
    const api = fakeApi({
      [`POST /manage/api-tokens/${TOKEN}/revoke`]: () =>
        json({ id: TOKEN, name: "Home Assistant", active: false }),
    });
    expect((await run(actions.revokeToken, fakeEvent({ form: { id: TOKEN } }).event)).value).toEqual({
      revoke: { name: "Home Assistant" },
    });
    expect((await run(actions.revokeToken, fakeEvent({ form: { id: "x" } }).event)).value).toMatchObject({
      status: 400,
    });
    expect(api.calls).toHaveLength(1);
    fakeApi({});
    expect((await run(actions.revokeToken, fakeEvent({ form: { id: TOKEN } }).event)).value).toMatchObject({
      status: 404,
      data: { revoke: { error: "not_found" } },
    });
  });
});

describe("the passkeys of the settings", () => {
  const raw = (id: string, createdAt: string, backedUp: boolean) => ({
    id,
    name: null,
    createdAt,
    backedUp,
    publicKey: "never-shown",
    credentialID: "never-shown",
    counter: 3,
  });

  it("lists them newest first, with neither their key nor their credential id", async () => {
    fakeApi({
      "GET /auth/passkey/list-user-passkeys": () =>
        json([raw(TOKEN, "2026-11-01T10:00:00.000Z", false), raw(OTHER, "2026-11-20T10:00:00.000Z", true)]),
    });
    vi.stubEnv("API_ORIGIN", undefined);
    const { value } = await run(load, fakeEvent().event);
    expect((value as { passkeys: unknown }).passkeys).toEqual([
      { id: OTHER, name: null, createdAt: "2026-11-20T10:00:00.000Z", synced: true },
      { id: TOKEN, name: null, createdAt: "2026-11-01T10:00:00.000Z", synced: false },
    ]);
    expect(JSON.stringify(value)).not.toContain("never-shown");
  });

  it("sends to the sign-in page without a session", async () => {
    fakeApi({ "GET /auth/passkey/list-user-passkeys": () => json({ code: "UNAUTHORIZED" }, 401) });
    const { event } = fakeEvent({ url: "https://app.test/reglages" });
    expect((await run(load, event)).thrown).toMatchObject({
      status: 303,
      location: "/connexion?retour=%2Freglages",
    });
  });

  it("renames one", async () => {
    const api = fakeApi({ "POST /auth/passkey/update-passkey": () => json({ passkey: {} }) });
    const { event } = fakeEvent({ form: { id: TOKEN, name: " Téléphone de Marie " } });
    expect((await run(actions.renamePasskey, event)).value).toEqual({
      passkey: { renamed: "Téléphone de Marie" },
    });
    expect(api.calls[0]?.body).toEqual({ id: TOKEN, name: "Téléphone de Marie" });
  });

  it("refuses an empty or too long name, or a bad id, without calling the API", async () => {
    const api = fakeApi({});
    for (const [form, error] of [
      [{ id: TOKEN, name: " " }, "invalid_name"],
      [{ id: TOKEN, name: "x".repeat(61) }, "invalid_name"],
      [{ id: "../me", name: "x" }, "invalid_request"],
    ] as const) {
      expect((await run(actions.renamePasskey, fakeEvent({ form }).event)).value).toMatchObject({
        status: 400,
        data: { passkey: { error } },
      });
    }
    expect((await run(actions.deletePasskey, fakeEvent({ form: { id: "x" } }).event)).value).toMatchObject({
      status: 400,
    });
    expect(api.calls).toHaveLength(0);
  });

  it("deletes one", async () => {
    const api = fakeApi({ "POST /auth/passkey/delete-passkey": () => json({ status: true }) });
    const { event } = fakeEvent({ form: { id: TOKEN, name: "Mac" } });
    expect((await run(actions.deletePasskey, event)).value).toEqual({ passkey: { deleted: "Mac" } });
    expect(api.calls[0]?.body).toEqual({ id: TOKEN });
  });

  it("says when the API refuses, such as someone else's passkey", async () => {
    fakeApi({
      "POST /auth/passkey/delete-passkey": () => json({ code: "PASSKEY_NOT_FOUND" }, 404),
      "POST /auth/passkey/update-passkey": () => json({}, 500),
    });
    expect(
      (await run(actions.deletePasskey, fakeEvent({ form: { id: TOKEN, name: "Mac" } }).event)).value,
    ).toMatchObject({ status: 404, data: { passkey: { error: "passkey_not_found", id: TOKEN } } });
    expect(
      (await run(actions.renamePasskey, fakeEvent({ form: { id: TOKEN, name: "Mac" } }).event)).value,
    ).toMatchObject({ status: 500, data: { passkey: { error: "unknown" } } });
  });
});
