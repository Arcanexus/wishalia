import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../test/event.ts";
import { load as appLayout } from "./(app)/+layout.server.ts";
import { actions as homeActions, load as home } from "./(app)/+page.server.ts";
import { actions as listActions, load as listPage } from "./(app)/listes/[id]/+page.server.ts";
import { load as previewPage } from "./(app)/listes/[id]/apercu/+page.server.ts";
import { load as rootLayout } from "./+layout.server.ts";
import { actions as signIn, load as signInPage } from "./connexion/+page.server.ts";
import { POST as signOut } from "./deconnexion/+server.ts";
import { POST as preferences } from "./preferences/+server.ts";

const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ITEM = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a11";
const list = (patch: object = {}) => ({ id: LIST, name: "Noël", theme: null, itemCount: 1, ...patch });

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

// The handlers' own types want the whole SvelteKit event: these tests give what they read
const run = (handler: unknown, event: unknown) =>
  outcome(() => (handler as (event: unknown) => unknown)(event));

describe("the root layout", () => {
  it("gives the app's name and the display choices the header menu shows", async () => {
    vi.stubEnv("APP_NAME", "Les envies");
    const { event } = fakeEvent();
    event.locals.mode = "light";
    expect((await run(rootLayout, event)).value).toEqual({
      appName: "Les envies",
      locale: "fr",
      mode: "light",
      themeChoice: "auto",
    });
  });
});

describe("/preferences", () => {
  it("moves to the next mode, keeps it with the account, and goes back to the page, never elsewhere", async () => {
    const api = fakeApi({ "PATCH /manage/me": () => json({}) });
    const { event, setCookies } = fakeEvent({ form: { retour: "/listes/1" }, cookie: "s=1" });
    event.locals.mode = "dark";
    expect((await run(preferences, event)).thrown).toMatchObject({ status: 303, location: "/listes/1" });
    expect(setCookies[0]).toMatchObject({
      name: "wishalia.mode",
      value: "device",
      options: { secure: true },
    });

    const away = fakeEvent({ url: "http://localhost/preferences", form: { retour: "//evil.test" } });
    expect((await run(preferences, away.event)).thrown).toMatchObject({ location: "/" });
    expect(away.setCookies[0]?.options?.secure).toBe(false);
    // Only the signed-in request went to the API
    expect(api.calls).toEqual([expect.objectContaining({ method: "PATCH", body: { mode: "device" } })]);
  });

  it("switches to the language the button names, with the account too", async () => {
    const api = fakeApi({ "PATCH /manage/me": () => json({}) });
    const { event, setCookies } = fakeEvent({ form: { retour: "/reglages", langue: "en" }, cookie: "s=1" });
    expect((await run(preferences, event)).thrown).toMatchObject({ status: 303, location: "/reglages" });
    expect(setCookies).toEqual([expect.objectContaining({ name: "wishalia.locale", value: "en" })]);
    expect(api.calls).toEqual([expect.objectContaining({ body: { locale: "en" } })]);
  });

  it("takes the mode or the theme the display menu names, with the account too", async () => {
    const api = fakeApi({ "PATCH /manage/me": () => json({}) });
    const dark = fakeEvent({ form: { retour: "/", mode: "dark" }, cookie: "s=1" });
    await run(preferences, dark.event);
    expect(dark.setCookies).toEqual([expect.objectContaining({ name: "wishalia.mode", value: "dark" })]);
    const christmas = fakeEvent({ form: { retour: "/", theme: "christmas" }, cookie: "s=1" });
    await run(preferences, christmas.event);
    expect(christmas.setCookies).toEqual([
      expect.objectContaining({ name: "wishalia.theme", value: "christmas" }),
    ]);
    expect(api.calls.map((call) => call.body)).toEqual([{ mode: "dark" }, { theme: "christmas" }]);
  });

  it("keeps the choice on the device when the API cannot be reached", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
    const { event, setCookies } = fakeEvent({ form: { retour: "/" }, cookie: "s=1" });
    expect((await run(preferences, event)).thrown).toMatchObject({ status: 303, location: "/" });
    expect(setCookies[0]).toMatchObject({ name: "wishalia.mode", value: "light" });
  });
});

describe("/deconnexion", () => {
  it("ends the session on the API and clears its cookie", async () => {
    const api = fakeApi({
      "POST /auth/sign-out": () =>
        json({ success: true }, 200, { "set-cookie": "wishalia.session=; Max-Age=0; Path=/" }),
    });
    const { event, setCookies } = fakeEvent({ form: {}, cookie: "wishalia.session=abc" });
    expect((await run(signOut, event)).thrown).toMatchObject({
      status: 303,
      location: "/connexion?au-revoir",
    });
    expect(api.calls[0]?.headers.get("cookie")).toBe("wishalia.session=abc");
    expect(setCookies[0]).toMatchObject({ name: "wishalia.session", value: "", options: { maxAge: 0 } });
  });

  it("sends back to a page of the app after signing in again, never to another site", async () => {
    fakeApi({ "POST /auth/sign-out": () => json({ success: true }) });
    for (const [back, location] of [
      ["/reglages", "/connexion?retour=%2Freglages"],
      ["//evil.example", "/connexion?retour=%2F"],
    ]) {
      const { event } = fakeEvent({ url: `https://app.test/deconnexion?retour=${back}`, form: {} });
      expect((await run(signOut, event)).thrown).toMatchObject({ status: 303, location });
    }
  });
});

describe("/connexion", () => {
  it("sends a signed-in person on, and shows the single sign-on button when it is set up", async () => {
    fakeApi({ "GET /manage/me": () => json({ id: "u" }) });
    const signedIn = fakeEvent({ url: "https://app.test/connexion?retour=/listes/1" }).event;
    expect((await run(signInPage, signedIn)).thrown).toMatchObject({ status: 303, location: "/listes/1" });

    fakeApi({});
    vi.stubEnv("OIDC_ISSUER", "https://id.test");
    vi.stubEnv("OIDC_NAME", "Authentik");
    const failed = fakeEvent({ url: "https://app.test/connexion?erreur" }).event;
    expect((await run(signInPage, failed)).value).toEqual({
      oidc: true,
      oidcName: "Authentik",
      failed: true,
      returnPath: "/",
      signedOut: false,
    });
    vi.stubEnv("OIDC_ISSUER", undefined);
    vi.stubEnv("OIDC_NAME", undefined);
    expect(
      (await run(signInPage, fakeEvent({ url: "https://app.test/connexion?au-revoir" }).event)).value,
    ).toEqual({
      oidc: false,
      oidcName: "SSO",
      failed: false,
      returnPath: "/",
      signedOut: true,
    });
    const passkey = fakeEvent({ url: "https://app.test/connexion?retour=//evil.example" }).event;
    expect((await run(signInPage, passkey)).value).toMatchObject({ returnPath: "/" });
  });

  it("sends a magic link back to where the person was going", async () => {
    const api = fakeApi({ "POST /auth/sign-in/magic-link": () => json({ status: true }) });
    const { event } = fakeEvent({
      url: "https://app.test/connexion?retour=/listes/1",
      form: { email: " marie@example.test " },
    });
    expect((await run(signIn.email, event)).value).toEqual({ sent: "marie@example.test" });
    expect(api.calls[0]?.body).toEqual({
      email: "marie@example.test",
      callbackURL: "/listes/1",
      errorCallbackURL: "/connexion?erreur",
    });
  });

  it("explains a wrong address, too many requests and an unavailable sign-in", async () => {
    let status = 429;
    const api = fakeApi({ "POST /auth/sign-in/magic-link": () => json({}, status) });
    const send = (email: string) =>
      run(signIn.email, fakeEvent({ url: "https://app.test/connexion", form: { email } }).event);
    expect((await send("marie@")).value).toMatchObject({ status: 400, data: { error: "invalid_email" } });
    expect(api.calls).toHaveLength(0);
    expect((await send("marie@example.test")).value).toMatchObject({
      status: 429,
      data: { error: "too_many" },
    });
    status = 404;
    expect((await send("marie@example.test")).value).toMatchObject({
      status: 503,
      data: { error: "unavailable" },
    });
  });

  it("goes to the identity provider with the state cookie", async () => {
    let target = "https://id.test/authorize?state=1";
    const api = fakeApi({
      "POST /auth/sign-in/social": () =>
        json({ url: target, redirect: true }, 200, { "set-cookie": "wishalia.state=s; Path=/; HttpOnly" }),
    });
    const { event, setCookies } = fakeEvent({ url: "https://app.test/connexion", form: {} });
    expect((await run(signIn.oidc, event)).thrown).toMatchObject({ status: 303, location: target });
    expect(api.calls[0]?.body).toMatchObject({ provider: "oidc", callbackURL: "/" });
    expect(setCookies[0]).toMatchObject({ name: "wishalia.state" });

    target = "javascript:alert(1)";
    const refused = fakeEvent({ url: "https://app.test/connexion", form: {} });
    expect((await run(signIn.oidc, refused.event)).value).toMatchObject({ status: 503 });
    expect(refused.setCookies).toHaveLength(0);
  });
});

describe("the app pages", () => {
  it("need a session", async () => {
    fakeApi({ "GET /manage/me": () => json({ error: "unauthenticated" }, 401) });
    const { event } = fakeEvent({ url: "https://app.test/listes/1" });
    expect((await run(appLayout, event)).thrown).toMatchObject({
      status: 303,
      location: "/connexion?retour=%2Flistes%2F1",
    });
    const me = {
      id: "u",
      displayName: "Marie",
      email: "m@x.test",
      theme: "christmas",
      mode: "dark",
      locale: "auto",
    };
    fakeApi({ "GET /manage/me": () => json(me) });
    const signedIn = fakeEvent();
    expect((await run(appLayout, signedIn.event)).value).toEqual({
      me,
      locale: "fr",
      mode: "dark",
    });
    // The account's settings win, and the device follows them
    expect(signedIn.event.locals).toMatchObject({ themeChoice: "christmas", mode: "dark" });
    expect(signedIn.setCookies.map((cookie) => [cookie.name, cookie.value])).toEqual([
      ["wishalia.theme", "christmas"],
      ["wishalia.mode", "dark"],
    ]);
    const same = fakeEvent({ cookies: { "wishalia.theme": "christmas", "wishalia.mode": "dark" } });
    same.event.locals.themeChoice = "christmas";
    same.event.locals.mode = "dark";
    await run(appLayout, same.event);
    expect(same.setCookies).toHaveLength(0);
  });

  it("speak the account's language, on this device too", async () => {
    fakeApi({
      "GET /manage/me": () =>
        json({
          id: "u",
          displayName: "Mary",
          email: "m@x.test",
          theme: "auto",
          mode: "device",
          locale: "en",
        }),
    });
    const { event, setCookies } = fakeEvent();
    expect((await run(appLayout, event)).value).toMatchObject({ locale: "en" });
    expect(event.locals.locale).toBe("en");
    expect(setCookies).toEqual([expect.objectContaining({ name: "wishalia.locale", value: "en" })]);

    fakeApi({
      "GET /manage/me": () =>
        json({
          id: "u",
          displayName: "Mary",
          email: "m@x.test",
          theme: "auto",
          mode: "device",
          locale: "auto",
        }),
    });
    const back = fakeEvent({ cookies: { "wishalia.locale": "en" } });
    back.event.locals.localeChoice = "en";
    await run(appLayout, back.event);
    expect(back.event.cookies.get("wishalia.locale")).toBeUndefined();
  });

  it("list the lists, and open a new one once created", async () => {
    const api = fakeApi({
      "GET /manage/lists": () => json([list()]),
      "POST /manage/lists": (body) => json(list(body as object), 201),
    });
    expect((await run(home, fakeEvent().event)).value).toEqual({ lists: [list()], archived: [list()] });
    // The archived lists come apart, to restore or delete them
    expect(api.calls.filter((call) => call.method === "GET").map((call) => call.path)).toEqual([
      "/manage/lists",
      "/manage/lists",
    ]);
    const created = await run(homeActions.createList, fakeEvent({ form: { name: " Noël " } }).event);
    expect(created.thrown).toMatchObject({ status: 303, location: `/listes/${LIST}` });
    expect(api.calls.at(-1)?.body).toEqual({ name: "Noël" });
    expect((await run(homeActions.createList, fakeEvent({ form: { name: "" } }).event)).value).toMatchObject({
      status: 400,
    });
  });

  it("pass the API's refusal of a list on", async () => {
    fakeApi({ "POST /manage/lists": () => json({ error: "invalid_request" }, 400) });
    expect((await run(homeActions.createList, fakeEvent({ form: { name: "x" } }).event)).value).toMatchObject(
      {
        status: 400,
        data: { createList: { error: "invalid_request", name: "x" } },
      },
    );
  });

  it("add from the home page into the first list, and change an item", async () => {
    const api = fakeApi({
      "POST /manage/items": () => json({ id: ITEM, title: "x", listId: LIST, duplicateOf: [] }, 201),
      [`PATCH /manage/items/${ITEM}`]: () => json({ id: ITEM, title: "x", status: "archived" }),
    });
    await run(homeActions.add, fakeEvent({ form: { input: "x" } }).event);
    expect(api.calls[0]?.body).toEqual({ input: "x" });
    expect(
      (await run(homeActions.status, fakeEvent({ form: { itemId: ITEM, status: "archived" } }).event)).value,
    ).toMatchObject({
      status: { status: "archived" },
    });
  });
});

describe("a list page", () => {
  it("shows the list and its items, in the theme the list forces", async () => {
    fakeApi({
      "GET /manage/lists": () =>
        json([list({ theme: "christmas" }), list({ id: "old", archivedAt: "2026-01-01T00:00:00Z" })]),
      [`GET /manage/lists/${LIST}/items`]: () => json([{ id: ITEM }]),
    });
    const { event } = fakeEvent({ params: { id: LIST } });
    // The lists an item can move to: never an archived one
    expect((await run(listPage, event)).value).toEqual({
      list: list({ theme: "christmas" }),
      items: [{ id: ITEM }],
      lists: [list({ theme: "christmas" })],
      gifts: {},
    });
    expect(event.locals.listTheme).toBe("christmas");
  });

  it("says who gave what outside events, only where the secret is lifted", async () => {
    const RECEIVED = "9b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a11";
    const gift = { id: 1, type: "reserved", at: "", actorId: null };
    const api = fakeApi({
      "GET /manage/lists": () => json([list({ revealMode: "received", secretLifted: false })]),
      [`GET /manage/lists/${LIST}/items`]: () =>
        json([
          { id: ITEM, status: "open" },
          { id: RECEIVED, status: "received" },
        ]),
      [`GET /manage/items/${RECEIVED}/history`]: () =>
        json([
          { ...gift, payload: { contributionId: "a", eventId: null, name: "Paul", message: "Merci !" } },
        ]),
    });
    const { value } = (await run(listPage, fakeEvent({ params: { id: LIST } }).event)) as {
      value: { gifts: Record<string, unknown> };
    };
    expect(value.gifts).toEqual({
      [RECEIVED]: [{ name: "Paul", amountCents: null, units: null, message: "Merci !" }],
    });
    // The open item's history is never asked for: its secret holds
    expect(api.calls.map((call) => call.path)).not.toContain(`/manage/items/${ITEM}/history`);

    // A list whose secret the owner lifted: every item
    const lifted = fakeApi({
      "GET /manage/lists": () => json([list({ revealMode: "manual", secretLifted: true })]),
      [`GET /manage/lists/${LIST}/items`]: () => json([{ id: ITEM, status: "open" }]),
      [`GET /manage/items/${ITEM}/history`]: () => json([]),
    });
    await run(listPage, fakeEvent({ params: { id: LIST } }).event);
    expect(lifted.calls.map((call) => call.path)).toContain(`/manage/items/${ITEM}/history`);
  });

  it("answers 404 for someone else's list or a wrong address", async () => {
    fakeApi({
      "GET /manage/lists": () => json([]),
      [`GET /manage/lists/${LIST}/items`]: () => json([]),
      "GET /manage/lists/nope/items": () => json({ error: "invalid_request" }, 400),
    });
    for (const id of [LIST, "nope"]) {
      expect((await run(listPage, fakeEvent({ params: { id } }).event)).thrown).toMatchObject({
        status: 404,
        body: { message: "Cette liste n'existe pas, ou plus." },
      });
    }
  });

  it("lets other API failures through", async () => {
    fakeApi({ "GET /manage/lists": () => json({ error: "boom" }, 500) });
    expect((await run(listPage, fakeEvent({ params: { id: LIST } }).event)).thrown).toMatchObject({
      status: 500,
    });
  });

  it("adds into this list", async () => {
    const api = fakeApi({
      "POST /manage/items": () => json({ id: ITEM, title: "x", listId: LIST, duplicateOf: [] }, 201),
      [`PATCH /manage/items/${ITEM}`]: () => json({ id: ITEM, title: "x", status: "received" }),
    });
    await run(listActions.add, fakeEvent({ form: { input: "x" }, params: { id: LIST } }).event);
    expect(api.calls[0]?.body).toEqual({ input: "x", listId: LIST });
    await run(listActions.status, fakeEvent({ form: { itemId: ITEM, status: "received" } }).event);
    expect(api.calls[1]?.method).toBe("PATCH");
  });
});

describe("a list's preview", () => {
  const item = (id: string, patch: object = {}) => ({
    id,
    kind: "unique",
    repeatable: false,
    title: id,
    url: null,
    notes: null,
    priceCents: null,
    targetCents: null,
    quantity: null,
    status: "open",
    ...patch,
  });

  it("shows the items as relatives see them, with made-up gifts, never reading a real one", async () => {
    const api = fakeApi({
      "GET /manage/lists": () => json([list({ theme: "christmas" })]),
      [`GET /manage/lists/${LIST}/items`]: () =>
        json([
          item("taken"),
          item("free"),
          item("gone", { status: "archived" }),
          item("got", { status: "received" }),
        ]),
    });
    const { event } = fakeEvent({ params: { id: LIST } });
    const { value } = (await run(previewPage, event)) as {
      value: { items: { id: string; funding: { state: string; contributors: { name: string }[] } | null }[] };
    };
    // What is still to give first, as relatives see it; nothing archived
    expect(value.items.map((entry) => entry.id)).toEqual(["free", "taken", "got"]);
    expect(value.items[1]?.funding?.contributors[0]?.name).toMatch(/\(exemple\)$/);
    expect(event.locals.listTheme).toBe("christmas");
    // Only the list and its items: no history, no contribution
    expect(api.calls.map((call) => call.path)).toEqual(["/manage/lists", `/manage/lists/${LIST}/items`]);
  });

  it("answers 404 for someone else's list or a wrong address, and lets other failures through", async () => {
    fakeApi({
      "GET /manage/lists": () => json([]),
      [`GET /manage/lists/${LIST}/items`]: () => json([]),
      "GET /manage/lists/nope/items": () => json({ error: "invalid_request" }, 400),
    });
    for (const id of [LIST, "nope"]) {
      expect((await run(previewPage, fakeEvent({ params: { id } }).event)).thrown).toMatchObject({
        status: 404,
      });
    }
    fakeApi({ "GET /manage/lists": () => json({ error: "boom" }, 500) });
    expect((await run(previewPage, fakeEvent({ params: { id: LIST } }).event)).thrown).toMatchObject({
      status: 500,
    });
  });
});

describe("archived and deleted lists and items", () => {
  it("restore an archived list from the home page", async () => {
    const api = fakeApi({ [`PATCH /manage/lists/${LIST}`]: () => json(list({ archivedAt: null })) });
    expect((await run(homeActions.restoreList, fakeEvent({ form: { listId: LIST } }).event)).value).toEqual({
      restore: { listId: LIST, name: "Noël" },
    });
    expect(api.calls[0]?.body).toEqual({ archived: false });
    expect(
      (await run(homeActions.restoreList, fakeEvent({ form: { listId: "x" } }).event)).value,
    ).toMatchObject({
      status: 400,
    });
    fakeApi({ [`PATCH /manage/lists/${LIST}`]: () => json({ error: "not_found" }, 404) });
    expect(
      (await run(homeActions.restoreList, fakeEvent({ form: { listId: LIST } }).event)).value,
    ).toMatchObject({
      status: 404,
      data: { restore: { error: "not_found" } },
    });
  });

  it("delete a list for good only once confirmed, from the home page or its own page", async () => {
    const api = fakeApi({ [`DELETE /manage/lists/${LIST}`]: () => new Response(null, { status: 204 }) });
    expect(
      (await run(homeActions.deleteList, fakeEvent({ form: { listId: LIST } }).event)).value,
    ).toMatchObject({
      status: 400,
      data: { remove: { error: "confirm" } },
    });
    expect(api.calls).toHaveLength(0);
    const fromHome = await run(
      homeActions.deleteList,
      fakeEvent({ form: { listId: LIST, confirm: "oui" } }).event,
    );
    expect(fromHome.thrown).toMatchObject({ status: 303, location: "/?supprimee=1" });
    const page = fakeEvent({ form: { confirm: "oui" } }).event;
    const fromPage = await run(listActions.deleteList, { ...page, params: { id: LIST } } as never);
    expect(fromPage.thrown).toMatchObject({ status: 303, location: "/?supprimee=1" });
    expect(api.calls.map((call) => `${call.method} ${call.path}`)).toEqual([
      `DELETE /manage/lists/${LIST}`,
      `DELETE /manage/lists/${LIST}`,
    ]);
    expect(
      (await run(homeActions.deleteList, fakeEvent({ form: { listId: "x", confirm: "oui" } }).event)).value,
    ).toMatchObject({ status: 400 });
    fakeApi({ [`DELETE /manage/lists/${LIST}`]: () => json({ error: "not_found" }, 404) });
    expect(
      (await run(homeActions.deleteList, fakeEvent({ form: { listId: LIST, confirm: "oui" } }).event)).value,
    ).toMatchObject({ status: 404, data: { remove: { error: "not_found" } } });
  });

  it("delete an item for good only once confirmed", async () => {
    const api = fakeApi({ [`DELETE /manage/items/${ITEM}`]: () => new Response(null, { status: 204 }) });
    const ask = (form: Record<string, string>) =>
      run(listActions.deleteItem, fakeEvent({ form }).event as never);
    expect((await ask({ itemId: ITEM, title: "Vélo" })).value).toMatchObject({
      status: 400,
      data: { remove: { error: "confirm" } },
    });
    expect(api.calls).toHaveLength(0);
    expect((await ask({ itemId: ITEM, title: "Vélo", confirm: "oui" })).value).toEqual({
      remove: { itemId: ITEM, title: "Vélo" },
    });
    expect((await ask({ itemId: "x", confirm: "oui" })).value).toMatchObject({ status: 400 });
    fakeApi({ [`DELETE /manage/items/${ITEM}`]: () => json({ error: "not_found" }, 404) });
    expect((await ask({ itemId: ITEM, confirm: "oui" })).value).toMatchObject({
      status: 404,
      data: { remove: { error: "not_found" } },
    });
  });
});
