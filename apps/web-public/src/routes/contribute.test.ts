import { afterEach, describe, expect, it, vi } from "vitest";

import { GIFTS_COOKIE, readGifts, type StoredGift, UNFOLDED_COOKIE } from "#lib/server/gifts.ts";
import type { PublicView } from "@wishalia/ui/public/types.ts";

import { actions, load } from "./s/[token]/+page.server.ts";

const TOKEN = "lJpW6x-D_tXnfGhRLEOeY3eATGcHGdZFpApAzoqzEiQ";
const KEY = "SWAxYwVjoZUrJdY7bQz73fBMdrFc-TGUVAMIbnidLfA";
const ITEM = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a11";
const EVENT = "7a1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const GIFT = "1c1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

function api(routes: Record<string, (body: unknown) => Response>) {
  const calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit = {}) => {
      const method = init.method ?? "GET";
      const path = new URL(url).pathname;
      const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
      calls.push({ method, path, headers: new Headers(init.headers), body });
      return routes[`${method} ${path}`]?.(body) ?? json({ error: "not_found" }, 404);
    }),
  );
  return calls;
}

/** A cookie jar that remembers what the handler sets. */
function jar(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  const set: { name: string; value: string; options: Record<string, unknown> }[] = [];
  return {
    set,
    cookies: {
      get: (name: string) => values.get(name),
      set: (name: string, value: string, options: Record<string, unknown>) => {
        values.set(name, value);
        set.push({ name, value, options });
      },
      delete: (name: string, options: Record<string, unknown>) => {
        values.delete(name);
        set.push({ name, value: "", options });
      },
    },
  };
}

const keep = (gifts: StoredGift[]) => Buffer.from(JSON.stringify(gifts)).toString("base64url");
const stored: StoredGift = {
  id: GIFT,
  itemId: ITEM,
  eventId: EVENT,
  amountCents: 2000,
  units: null,
  key: KEY,
};

function event(form?: Record<string, string>, cookies: Record<string, string> = {}) {
  const box = jar(cookies);
  return {
    box,
    input: {
      params: { token: TOKEN },
      url: new URL(`https://wishalia.test/s/${TOKEN}`),
      request: new Request(`https://wishalia.test/s/${TOKEN}`, {
        method: form ? "POST" : "GET",
        ...(form ? { body: new URLSearchParams(form) } : {}),
      }),
      cookies: box.cookies,
      getClientAddress: () => "10.0.0.9",
      locals: {
        themeChoice: "auto",
        mode: "device",
        listTheme: null,
        christmas: false,
        localeChoice: "auto",
        locale: "fr",
      },
      setHeaders: () => {},
      depends: () => {},
    },
  };
}

const run = async (handler: unknown, input: unknown) => {
  try {
    return { value: await (handler as (event: unknown) => unknown)(input) };
  } catch (thrown) {
    return { thrown: thrown as { status: number } };
  }
};

const created = (patch: object = {}) =>
  json(
    {
      contribution: { id: GIFT, itemId: ITEM, eventId: EVENT, amountCents: 2000, units: null, ...patch },
      withdrawKey: KEY,
    },
    201,
  );

describe("giving", () => {
  it("pledges through the API, then keeps the gift and the name on this device", async () => {
    const calls = api({ [`POST /public/items/${ITEM}/contributions`]: () => created() });
    const { input, box } = event({
      itemId: ITEM,
      eventId: EVENT,
      amount: "20",
      guestName: " Mamie ",
      message: "Joyeux Noël",
      anonymous: "on",
    });
    expect((await run(actions.give, input)).value).toEqual({ given: { itemId: ITEM } });
    expect(calls[0]?.headers.get("x-share-token")).toBe(TOKEN);
    expect(calls[0]?.body).toEqual({
      eventId: EVENT,
      amountCents: 2000,
      guestName: "Mamie",
      message: "Joyeux Noël",
      anonymous: true,
    });
    const gifts = box.set.find((cookie) => cookie.name === GIFTS_COOKIE);
    expect(gifts?.options).toMatchObject({
      path: `/s/${TOKEN}`,
      httpOnly: true,
      secure: true,
      sameSite: "lax",
    });
    expect(readGifts(box.cookies as never)).toEqual([stored]);
    expect(box.set.find((cookie) => cookie.name === "wishalia.guest_name")?.value).toBe("Mamie");
  });

  it("reserves copies of an item, with or without an account", async () => {
    const calls = api({
      [`POST /public/items/${ITEM}/contributions`]: () => created({ amountCents: null, units: 2 }),
    });
    const { input } = event({ itemId: ITEM, units: "2" });
    expect((await run(actions.give, input)).value).toEqual({ given: { itemId: ITEM } });
    expect(calls[0]?.body).toEqual({ units: 2, anonymous: false });
  });

  it("gives a gift with a price whole, or a share of it, as the guest chose", async () => {
    const calls = api({ [`POST /public/items/${ITEM}/contributions`]: () => created() });
    // « Whole » ignores an amount typed before changing one's mind
    await run(actions.give, event({ itemId: ITEM, way: "whole", amount: "20" }).input);
    await run(actions.give, event({ itemId: ITEM, way: "part", amount: "20" }).input);
    expect(calls.map((call) => call.body)).toEqual([
      { anonymous: false },
      { amountCents: 2000, anonymous: false },
    ]);
    expect(
      (await run(actions.give, event({ itemId: ITEM, way: "part", amount: " " }).input)).value,
    ).toMatchObject({ status: 400, data: { give: { error: "amount_required", way: "part" } } });
    expect(calls).toHaveLength(2);
  });

  it("refuses a bad amount, count, text or id without calling the API", async () => {
    const calls = api({});
    for (const [form, error] of [
      [{ itemId: ITEM, amount: "vingt" }, "amount_required"],
      [{ itemId: ITEM, amount: "-5" }, "amount_required"],
      [{ itemId: ITEM, amount: "2000000" }, "amount_required"],
      [{ itemId: ITEM, units: "0" }, "units_required"],
      [{ itemId: ITEM, guestName: "x".repeat(61) }, "too_long"],
      [{ itemId: "../manage" }, "invalid_request"],
      [{ itemId: ITEM, eventId: "x" }, "invalid_request"],
    ] as const) {
      expect((await run(actions.give, event(form).input)).value).toMatchObject({
        status: 400,
        data: { give: { error } },
      });
    }
    expect(calls).toHaveLength(0);
  });

  it("asks for a name when a guest without an account gives none", async () => {
    api({ [`POST /public/items/${ITEM}/contributions`]: () => json({ error: "invalid_request" }, 400) });
    expect((await run(actions.give, event({ itemId: ITEM }).input)).value).toMatchObject({
      status: 400,
      data: { give: { error: "name_required", itemId: ITEM } },
    });
  });

  it("passes the API's refusal on, with what was typed", async () => {
    api({ [`POST /public/items/${ITEM}/contributions`]: () => json({ error: "already_reserved" }, 409) });
    const { input, box } = event({ itemId: ITEM, guestName: "Paul" });
    expect((await run(actions.give, input)).value).toMatchObject({
      status: 409,
      data: { give: { error: "already_reserved", guestName: "Paul" } },
    });
    expect(box.set).toHaveLength(0);
  });

  it("shows the dead-link page when the link died meanwhile", async () => {
    api({ [`POST /public/items/${ITEM}/contributions`]: () => json({ error: "link_not_found" }, 404) });
    expect((await run(actions.give, event({ itemId: ITEM }).input)).thrown).toMatchObject({ status: 404 });
  });
});

describe("withdrawing", () => {
  it("sends the key kept on this device, then forgets the gift", async () => {
    const calls = api({
      [`DELETE /public/contributions/${GIFT}`]: () => new Response(null, { status: 204 }),
    });
    const { input, box } = event({ id: GIFT }, { [GIFTS_COOKIE]: keep([stored]) });
    expect((await run(actions.withdraw, input)).value).toEqual({ withdrawn: { itemId: ITEM } });
    expect(calls[0]?.headers.get("x-withdraw-key")).toBe(KEY);
    expect(readGifts(box.cookies as never)).toEqual([]);
  });

  it("withdraws by the account, with no key", async () => {
    const calls = api({
      [`DELETE /public/contributions/${GIFT}`]: () => new Response(null, { status: 204 }),
    });
    expect((await run(actions.withdraw, event({ id: GIFT }).input)).value).toEqual({
      withdrawn: { itemId: null },
    });
    expect(calls[0]?.headers.has("x-withdraw-key")).toBe(false);
  });

  it("says why it cannot, and keeps the gift", async () => {
    api({ [`DELETE /public/contributions/${GIFT}`]: () => json({ error: "event_closed" }, 409) });
    const { input, box } = event({ id: GIFT }, { [GIFTS_COOKIE]: keep([stored]) });
    expect((await run(actions.withdraw, input)).value).toMatchObject({
      status: 409,
      data: { withdraw: { id: GIFT, error: "event_closed" } },
    });
    expect(box.set).toHaveLength(0);
  });

  it("refuses someone else's gift, and a bad id", async () => {
    api({});
    expect((await run(actions.withdraw, event({ id: GIFT }).input)).value).toMatchObject({ status: 404 });
    expect((await run(actions.withdraw, event({ id: "x" }).input)).value).toMatchObject({ status: 400 });
  });
});

describe("the gifts on the page", () => {
  const view = (): PublicView => ({
    audience: "Mamie",
    scope: "list",
    viewer: "guest",
    owner: { displayName: "Léa" },
    me: null,
    list: { id: "l", name: "Mes envies", theme: null },
    event: null,
    events: [],
    items: [
      {
        id: ITEM,
        kind: "pool",
        repeatable: false,
        title: "Vélo",
        url: null,
        notes: null,
        priceCents: null,
        targetCents: 32000,
        quantity: null,
        status: "open",
        eventIds: [],
        funding: {
          state: "in_progress",
          progress: 0.1,
          contributors: [],
          mine: [
            { id: "2c1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", eventId: null, amountCents: 1000, units: null },
          ],
        },
      },
    ],
  });

  it("joins the account's gifts and this device's, never giving the keys to the page", async () => {
    api({ "GET /public/view": () => json(view()) });
    const gone = {
      ...stored,
      id: "3c1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
      itemId: "4c1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
    };
    const { input } = event(undefined, {
      [GIFTS_COOKIE]: keep([stored, gone]),
      "wishalia.guest_name": "Mamie",
    });
    const { value } = (await run(load, input)) as { value: { mine: unknown[]; guestName: string } };
    expect(value.mine).toEqual([
      {
        id: "2c1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b",
        itemId: ITEM,
        eventId: null,
        amountCents: 1000,
        units: null,
      },
      { id: GIFT, itemId: ITEM, eventId: EVENT, amountCents: 2000, units: null },
    ]);
    expect(JSON.stringify(value)).not.toContain(KEY);
    expect(value.guestName).toBe("Mamie");
  });

  it("tells about the person's gifts whose item left the list, by this device's keys only", async () => {
    const left = {
      id: GIFT,
      itemId: ITEM,
      title: "Vélo",
      state: "deleted",
      eventId: EVENT,
      amountCents: 2000,
      units: null,
    };
    const calls = api({
      "GET /public/view": () => json(view()),
      "POST /public/gifts/gone": () => json([left, { ...left, id: "9c1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b" }]),
    });
    const { input } = event(undefined, { [GIFTS_COOKIE]: keep([stored]) });
    const { value } = (await run(load, input)) as { value: { gone: unknown[] } };
    expect(calls.find((call) => call.path === "/public/gifts/gone")?.body).toEqual({
      gifts: [{ id: GIFT, key: KEY }],
    });
    // A gift of the account (not on this device) cannot be forgotten by this device
    expect(value.gone).toEqual([
      { ...left, onDevice: true },
      { ...left, id: "9c1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b", onDevice: false },
    ]);
    // The keys stay on the server
    expect(JSON.stringify(value)).not.toContain(KEY);
  });

  it("asks nothing without a gift on this device or an account, nor for the owner, and survives a failure", async () => {
    type Gone = { value: { gone: unknown[] } };
    const calls = api({ "GET /public/view": () => json(view()) });
    expect(((await run(load, event().input)) as Gone).value.gone).toEqual([]);
    const cookies = { [GIFTS_COOKIE]: keep([stored]) };
    const owner = api({ "GET /public/view": () => json({ ...view(), viewer: "owner", items: [] }) });
    expect(((await run(load, event(undefined, cookies).input)) as Gone).value.gone).toEqual([]);
    expect([...calls, ...owner].some((call) => call.path === "/public/gifts/gone")).toBe(false);
    // The API fails: the notice is left out, the page still opens
    api({
      "GET /public/view": () => json(view()),
      "POST /public/gifts/gone": () => json({ error: "unavailable" }, 503),
    });
    expect(((await run(load, event(undefined, cookies).input)) as Gone).value.gone).toEqual([]);
  });

  type Loaded = { view: PublicView; folded: boolean; mine: unknown[] };
  const load_ = async (patch: Partial<PublicView> = {}, cookies: Record<string, string> = {}) => {
    api({ "GET /public/view": () => json({ ...view(), ...patch }) });
    return ((await run(load, event(undefined, cookies).input)) as { value: Loaded }).value;
  };

  it("folds what others give for a visitor nobody knows, leaving it out of the page", async () => {
    const page = await load_();
    expect(page.folded).toBe(true);
    expect(page.view.items[0]?.funding).toBeNull();
    expect(page.mine).toEqual([]);
    expect(JSON.stringify(page)).not.toContain("in_progress");
  });

  it("unfolds once they say they are not the owner, or when they are known", async () => {
    expect((await load_({}, { [UNFOLDED_COOKIE]: "1" })).folded).toBe(false);
    expect((await load_({}, { [GIFTS_COOKIE]: keep([stored]) })).folded).toBe(false);
    const known = await load_({ me: { displayName: "Paul" } });
    expect(known.folded).toBe(false);
    expect(known.view.items[0]?.funding).not.toBeNull();
    // Nothing to fold for the owner: the API already gave them no funding
    const ownerItems = view().items.map((item) => ({ ...item, funding: null }));
    expect((await load_({ viewer: "owner", items: ownerItems })).folded).toBe(false);
  });

  it("remembers the choice for this link only, on the server side of the device", async () => {
    const { input, box } = event({});
    expect((await run(actions.unfold, input)).value).toEqual({ unfolded: true });
    expect(box.set).toEqual([
      {
        name: UNFOLDED_COOKIE,
        value: "1",
        options: expect.objectContaining({
          path: `/s/${TOKEN}`,
          httpOnly: true,
          sameSite: "lax",
          secure: true,
        }),
      },
    ]);
    const bad = event({});
    (bad.input.params as { token: string }).token = "../manage";
    expect((await run(actions.unfold, bad.input)).thrown).toMatchObject({ status: 404 });
  });

  it("drops a malformed cookie", () => {
    const bad = jar({ [GIFTS_COOKIE]: "not json" });
    expect(readGifts(bad.cookies as never)).toEqual([]);
    const odd = jar({ [GIFTS_COOKIE]: keep([{ ...stored, key: "short" }, stored]) });
    expect(readGifts(odd.cookies as never)).toEqual([stored]);
    const notList = jar({ [GIFTS_COOKIE]: Buffer.from("{}").toString("base64url") });
    expect(readGifts(notList.cookies as never)).toEqual([]);
  });
});
