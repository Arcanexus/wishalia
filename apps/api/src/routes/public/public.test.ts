import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../../test/app.js";

const FAMILY_EMAIL = "cousin@example.test";
let clock = new Date("2026-12-20T10:00:00Z");
let t: TestApp;
let owner: string;
let cousin: string;

beforeAll(async () => {
  t = await createTestApp({ OWNER_EMAILS: `${OWNER_EMAIL},${FAMILY_EMAIL}` }, () => clock);
  owner = await signIn(t, OWNER_EMAIL);
  cousin = await signIn(t, FAMILY_EMAIL);
}, 30_000);

afterAll(async () => {
  await t.close();
});

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON answers, read field by field
  body: any;
  cookies: string[];
}

async function send(options: InjectOptions): Promise<Answer> {
  const response = await t.app.inject(options);
  return {
    status: response.statusCode,
    body: response.body ? response.json() : null,
    cookies: [response.headers["set-cookie"] ?? []].flat(),
  };
}

const manage = (
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: object,
) => send({ method, url: `/manage${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });

/** A /public request through a share link, as a guest by default. */
const guest = (
  token: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  options: { payload?: object; cookie?: string; headers?: Record<string, string> } = {},
) =>
  send({
    method,
    url: `/public${url}`,
    headers: {
      "x-share-token": token,
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...options.headers,
    },
    ...(options.payload ? { payload: options.payload } : {}),
  });

async function item(input: string, listId: string, patch?: object) {
  const created = await manage(owner, "POST", "/items", { input, listId });
  expect(created.status).toBe(201);
  if (patch) expect((await manage(owner, "PATCH", `/items/${created.body.id}`, patch)).status).toBe(200);
  return created.body.id as string;
}

async function share(payload: object) {
  const created = await manage(owner, "POST", "/share-links", payload);
  expect(created.status).toBe(201);
  return created as Answer & { body: { id: string; token: string; url: string } };
}

const markerOf = (answer: Answer) =>
  (answer.cookies.find((c) => c.includes("owner_device=")) ?? "").split(";")[0] ?? "";

let listId: string;
let christmas: string;
let birthday: string;
let bike: string;
let lego: string;
let books: string;
let socks: string;
let lonely: string;
let parrainKey: { id: string; key: string };
let listLink: Answer & { body: { id: string; token: string; url: string } };

beforeAll(async () => {
  listId = (await manage(owner, "POST", "/lists", { name: "Pour Noël" })).body.id;
  christmas = (
    await manage(owner, "POST", "/events", { name: "Noël", kind: "christmas", date: "2026-12-24" })
  ).body.id;
  birthday = (await manage(owner, "POST", "/events", { name: "Anniversaire", date: "2027-03-02" })).body.id;
  bike = await item("Vélo", listId, { kind: "pool", targetCents: 30000 });
  lego = await item("Lego", listId);
  books = await item("Livres", listId, { kind: "quantity", quantity: 3 });
  socks = await item("Chaussettes", listId, { repeatable: true });
  lonely = await item("Sans événement", listId);
  for (const id of [bike, lego, books, socks]) {
    expect((await manage(owner, "PUT", `/events/${christmas}/items/${id}`)).status).toBe(204);
  }
  await manage(owner, "PUT", `/events/${birthday}/items/${bike}`);
  listLink = await share({ scope: "list", listId, audience: "Mamie" });
});

describe("share links in /manage", () => {
  it("gives the token once, on the public host, and marks the owner's device", async () => {
    expect(listLink.body.url).toBe(`https://wishalia.test/s/${listLink.body.token}`);
    expect(listLink.body).toMatchObject({ scope: "list", listId, audience: "Mamie", active: true });
    const cookie = listLink.cookies.find((c) => c.includes("owner_device="));
    expect(cookie).toMatch(/HttpOnly/);
    const listed = (await manage(owner, "GET", "/share-links")).body;
    expect(listed[0]).toMatchObject({ id: listLink.body.id, audience: "Mamie" });
    expect(JSON.stringify(listed)).not.toContain(listLink.body.token);
  });

  it("refuses someone else's list, an unknown event and a past expiry", async () => {
    expect(
      (await manage(cousin, "POST", "/share-links", { scope: "list", listId, audience: "x" })).status,
    ).toBe(404);
    const unknown = { scope: "event", eventId: crypto.randomUUID(), audience: "x" };
    expect((await manage(owner, "POST", "/share-links", unknown)).status).toBe(404);
    const past = { scope: "list", listId, audience: "x", expiresAt: "2026-01-01T00:00:00Z" };
    expect((await manage(owner, "POST", "/share-links", past)).status).toBe(400);
    expect((await manage(owner, "POST", "/share-links", { scope: "list", audience: "x" })).status).toBe(400);
  });

  it("marks the device when the owner copies a link", async () => {
    const marked = await manage(owner, "POST", "/device-marker");
    expect(marked.status).toBe(204);
    expect(markerOf(marked)).toContain("owner_device=");
  });

  it("revokes a link for good, and only the owner can", async () => {
    const link = await share({ scope: "list", listId, audience: "Temporaire" });
    expect((await manage(cousin, "POST", `/share-links/${link.body.id}/revoke`)).status).toBe(404);
    const revoked = await manage(owner, "POST", `/share-links/${link.body.id}/revoke`);
    expect(revoked.body).toMatchObject({ active: false });
    const again = await manage(owner, "POST", `/share-links/${link.body.id}/revoke`);
    expect(again.body.revokedAt).toBe(revoked.body.revokedAt);
    expect((await guest(link.body.token, "GET", "/view")).body).toEqual({ error: "link_not_found" });
  });
});

describe("the /public guard", () => {
  it("answers the same 404 without a link, with a wrong one or an expired one", async () => {
    expect((await send({ method: "GET", url: "/public/view" })).status).toBe(404);
    expect((await guest("not-a-token", "GET", "/view")).status).toBe(404);
    expect((await guest("a".repeat(43), "GET", "/view")).status).toBe(404);
    const link = await share({ scope: "list", listId, audience: "Court", expiresAt: "2026-12-21T00:00:00Z" });
    expect((await guest(link.body.token, "GET", "/view")).status).toBe(200);
    clock = new Date("2026-12-21T00:00:01Z");
    expect((await guest(link.body.token, "GET", "/view")).body).toEqual({ error: "link_not_found" });
    clock = new Date("2026-12-20T10:00:00Z");
  });

  it("keeps /ping open", async () => {
    expect((await send({ method: "GET", url: "/public/ping" })).body).toEqual({ scope: "public" });
  });
});

describe("contributions through a list link", () => {
  it("shows the list to a guest in the owner's order, without anything archived", async () => {
    const archived = await item("Vieux", listId, { status: "archived" });
    const view = await guest(listLink.body.token, "GET", "/view");
    expect(view.status).toBe(200);
    expect(view.body).toMatchObject({
      viewer: "guest",
      audience: "Mamie",
      scope: "list",
      owner: { displayName: expect.any(String) },
      list: { id: listId, name: "Pour Noël" },
      me: null,
    });
    const ids = view.body.items.map((entry: { id: string }) => entry.id);
    expect(ids).not.toContain(archived);
    expect(ids).toEqual(expect.arrayContaining([bike, lego, books, socks, lonely]));
    expect(view.body.events.map((event: { id: string }) => event.id)).toEqual([christmas, birthday]);
    const bikeView = view.body.items.find((entry: { id: string }) => entry.id === bike);
    expect(bikeView.eventIds).toEqual([christmas, birthday]);
    expect(bikeView.funding).toMatchObject({ state: "free", totalCents: 0, remainingCents: 30000 });
  });

  it("takes pledges on a pool, beyond the target, and hides amounts and anonymous names", async () => {
    const token = listLink.body.token;
    const foreignEvent = await guest(token, "POST", `/items/${lego}/contributions`, {
      payload: { eventId: birthday, guestName: "Mamie" },
    });
    expect(foreignEvent.status).toBe(404);
    const noName = await guest(token, "POST", `/items/${bike}/contributions`, {
      payload: { eventId: christmas, amountCents: 5000 },
    });
    expect(noName.status).toBe(400);

    const mamie = await guest(token, "POST", `/items/${bike}/contributions`, {
      payload: { eventId: christmas, guestName: "Mamie", amountCents: 20000, message: "Joyeux Noël" },
    });
    expect(mamie.status).toBe(201);
    expect(mamie.body.withdrawKey).toMatch(/^[A-Za-z0-9_-]{43}$/);
    await guest(token, "POST", `/items/${bike}/contributions`, {
      payload: { eventId: birthday, guestName: "Papi", amountCents: 15000, anonymous: true },
    });

    const funding = (await guest(token, "GET", "/view")).body.items.find(
      (entry: { id: string }) => entry.id === bike,
    ).funding;
    expect(funding).toMatchObject({
      state: "complete",
      progress: 1,
      totalCents: 35000,
      remainingCents: 0,
      overshootCents: 5000,
      byEvent: [
        { eventId: christmas, amountCents: 20000 },
        { eventId: birthday, amountCents: 15000 },
      ],
      contributors: [
        { name: "Mamie", mine: false },
        { name: null, mine: false },
      ],
      mine: [],
    });
    expect(JSON.stringify(funding)).not.toContain("Joyeux");
  });

  it("reserves a unique item once and the copies of a quantity item up to what is left", async () => {
    const token = listLink.body.token;
    const reserve = (id: string, payload: object) =>
      guest(token, "POST", `/items/${id}/contributions`, {
        payload: { eventId: christmas, guestName: "Tata", ...payload },
      });
    expect((await reserve(lego, {})).status).toBe(201);
    expect((await reserve(lego, {})).body).toEqual({ error: "already_reserved" });
    expect((await reserve(books, {})).body).toEqual({ error: "units_required" });
    expect((await reserve(books, { units: 2 })).status).toBe(201);
    expect((await reserve(books, { units: 2 })).body).toEqual({ error: "not_enough_left" });
    expect((await reserve(lonely, {})).status).toBe(404);
    expect((await reserve(crypto.randomUUID(), {})).status).toBe(404);
    const view = (await guest(token, "GET", "/view")).body;
    const booksView = view.items.find((entry: { id: string }) => entry.id === books);
    expect(booksView.funding).toMatchObject({ state: "in_progress", reservedUnits: 2 });
  });

  it("takes a contribution without an event: a list is not always tied to one", async () => {
    const made = await guest(listLink.body.token, "POST", `/items/${lonely}/contributions`, {
      payload: { guestName: "Parrain", message: "Bon appétit" },
    });
    expect(made.status).toBe(201);
    expect(made.body.contribution.eventId).toBeNull();
    parrainKey = { id: made.body.contribution.id, key: made.body.withdrawKey };
    const view = (await guest(listLink.body.token, "GET", "/view")).body;
    const lonelyView = view.items.find((entry: { id: string }) => entry.id === lonely);
    expect(lonelyView).toMatchObject({
      eventIds: [],
      funding: { state: "complete", contributors: [{ name: "Parrain" }] },
    });
  });

  it("lets the author withdraw with the key, and nobody else", async () => {
    const token = listLink.body.token;
    const made = await guest(token, "POST", `/items/${socks}/contributions`, {
      payload: { eventId: christmas, guestName: "Tonton" },
    });
    expect(made.status).toBe(201);
    const id = made.body.contribution.id;
    const withdraw = (key?: string) =>
      guest(token, "DELETE", `/contributions/${id}`, key ? { headers: { "x-withdraw-key": key } } : {});
    expect((await withdraw()).status).toBe(404);
    expect((await withdraw("b".repeat(43))).status).toBe(404);
    expect((await withdraw(made.body.withdrawKey)).status).toBe(204);
    expect((await withdraw(made.body.withdrawKey)).status).toBe(204);
    const view = (await guest(token, "GET", "/view")).body;
    expect(view.items.find((entry: { id: string }) => entry.id === socks).funding.state).toBe("free");
  });

  it("knows a family member with an account, and lets them withdraw by their session", async () => {
    const token = listLink.body.token;
    const made = await guest(token, "POST", `/items/${socks}/contributions`, {
      cookie: cousin,
      payload: { eventId: christmas },
    });
    expect(made.status).toBe(201);
    const view = (await guest(token, "GET", "/view", { cookie: cousin })).body;
    expect(view.viewer).toBe("guest");
    expect(view.me).toEqual({ displayName: expect.any(String) });
    const socksFunding = view.items.find((entry: { id: string }) => entry.id === socks).funding;
    expect(socksFunding).toMatchObject({ timesGiven: 1, contributors: [{ mine: true }] });
    expect(socksFunding.mine).toEqual([expect.objectContaining({ id: made.body.contribution.id })]);
    expect(
      (await guest(token, "DELETE", `/contributions/${made.body.contribution.id}`, { cookie: cousin }))
        .status,
    ).toBe(204);
  });
});

describe("anti-spoil on the public view", () => {
  it("recognises the owner by their session: no funding at all, and no contribution", async () => {
    const view = (await guest(listLink.body.token, "GET", "/view", { cookie: owner })).body;
    expect(view.viewer).toBe("owner");
    for (const entry of view.items) expect(entry.funding).toBeNull();
    expect(JSON.stringify(view)).not.toMatch(/Tata|Papi|20000|contributors|withdraw/);
    const attempt = await guest(listLink.body.token, "POST", `/items/${lego}/contributions`, {
      cookie: owner,
      payload: { eventId: christmas, guestName: "Moi" },
    });
    expect(attempt).toMatchObject({ status: 403, body: { error: "owner_cannot_contribute" } });
  });

  it("recognises the owner by the device marker alone, and ignores a forged one", async () => {
    const marker = markerOf(listLink);
    const view = (await guest(listLink.body.token, "GET", "/view", { cookie: marker })).body;
    expect(view.viewer).toBe("owner");
    expect(view.items.every((entry: { funding: unknown }) => entry.funding === null)).toBe(true);
    const forged = marker.replace(/\.[^.~]+$/, ".forged");
    expect((await guest(listLink.body.token, "GET", "/view", { cookie: forged })).body.viewer).toBe("guest");
  });

  it("keeps the history sealed in /manage", async () => {
    const entries = (await manage(owner, "GET", `/items/${bike}/history`)).body as { type: string }[];
    expect(entries.map((entry) => entry.type)).not.toContain("contribution_added");
  });

  it("opens an event link on its items only, and pins the event", async () => {
    const link = await share({ scope: "event", eventId: birthday, audience: "Collègues" });
    const view = (await guest(link.body.token, "GET", "/view")).body;
    expect(view.event).toMatchObject({ id: birthday, open: true });
    expect(view.items.map((entry: { id: string }) => entry.id)).toEqual([bike]);
    const other = await guest(link.body.token, "POST", `/items/${bike}/contributions`, {
      payload: { eventId: christmas, guestName: "Paul", amountCents: 100 },
    });
    expect(other.status).toBe(404);
    expect(
      (
        await guest(link.body.token, "POST", `/items/${lego}/contributions`, {
          payload: { guestName: "Paul" },
        })
      ).status,
    ).toBe(404);
    const pinned = await guest(link.body.token, "POST", `/items/${bike}/contributions`, {
      payload: { guestName: "Paul", amountCents: 100 },
    });
    expect(pinned.body.contribution.eventId).toBe(birthday);
  });

  it("shows the owner who gave what only once every event of the item is revealed", async () => {
    clock = new Date("2026-12-28T10:00:00Z");
    expect((await manage(owner, "POST", `/events/${christmas}/reveal`)).status).toBe(200);
    const view = (await guest(listLink.body.token, "GET", "/view", { cookie: owner })).body;
    const find = (id: string) => view.items.find((entry: { id: string }) => entry.id === id);
    // Lego is only in the revealed event; the bike is in the birthday too, still sealed
    expect(find(lego).funding).toMatchObject({ state: "complete", contributors: [{ name: "Tata" }] });
    expect(find(bike).funding).toBeNull();
    expect(view.events.find((event: { id: string }) => event.id === christmas).open).toBe(false);

    const closed = await guest(listLink.body.token, "POST", `/items/${socks}/contributions`, {
      payload: { eventId: christmas, guestName: "Tard" },
    });
    expect(closed.body).toEqual({ error: "event_closed" });
  });

  it("keeps a contribution without an event secret until the owner marks the item received", async () => {
    const before = (await guest(listLink.body.token, "GET", "/view", { cookie: owner })).body;
    expect(before.items.find((entry: { id: string }) => entry.id === lonely).funding).toBeNull();
    const sealed = (await manage(owner, "GET", `/items/${lonely}/history`)).body as { type: string }[];
    expect(sealed.map((entry) => entry.type)).not.toContain("reserved");
    expect(JSON.stringify(sealed)).not.toContain("Bon appétit");

    expect((await manage(owner, "PATCH", `/items/${lonely}`, { status: "received" })).status).toBe(200);
    const after = (await guest(listLink.body.token, "GET", "/view", { cookie: owner })).body;
    expect(after.items.find((entry: { id: string }) => entry.id === lonely).funding).toMatchObject({
      contributors: [{ name: "Parrain" }],
    });
    const lifted = (await manage(owner, "GET", `/items/${lonely}/history`)).body as {
      type: string;
      payload: { name?: string; message?: string | null };
    }[];
    // The guest's word reaches the owner with the name, once the secret is lifted
    expect(lifted.find((entry) => entry.type === "reserved")?.payload).toMatchObject({
      name: "Parrain",
      message: "Bon appétit",
    });
    const late = await guest(listLink.body.token, "DELETE", `/contributions/${parrainKey.id}`, {
      headers: { "x-withdraw-key": parrainKey.key },
    });
    expect(late).toMatchObject({ status: 409, body: { error: "item_closed" } });
  });

  it("in manual mode, keeps the secret of a list until the owner lifts it, whenever they decide", async () => {
    const list = (await manage(owner, "POST", "/lists", { name: "Toute l'année" })).body;
    expect(list).toMatchObject({ revealMode: "received", secretLifted: false });
    expect((await manage(owner, "POST", `/lists/${list.id}/reveal`)).body).toEqual({
      error: "reveal_on_received",
    });
    expect((await manage(owner, "PATCH", `/lists/${list.id}`, { revealMode: "manual" })).body).toMatchObject({
      revealMode: "manual",
    });
    const scarf = await item("Écharpe", list.id);
    const link = await share({ scope: "list", listId: list.id, audience: "Marraine" });
    const made = await guest(link.body.token, "POST", `/items/${scarf}/contributions`, {
      payload: { guestName: "Marraine" },
    });
    expect(made.status).toBe(201);

    // Received is not enough in manual mode
    await manage(owner, "PATCH", `/items/${scarf}`, { status: "received" });
    const sealed = (await guest(link.body.token, "GET", "/view", { cookie: owner })).body;
    expect(sealed.items[0].funding).toBeNull();
    await manage(owner, "PATCH", `/items/${scarf}`, { status: "open" });

    const lifted = await manage(owner, "POST", `/lists/${list.id}/reveal`);
    expect(lifted.body).toMatchObject({ secretLifted: true });
    expect((await manage(owner, "POST", `/lists/${list.id}/reveal`)).body).toMatchObject({
      secretLifted: true,
    });
    const view = (await guest(link.body.token, "GET", "/view", { cookie: owner })).body;
    expect(view.items[0].funding).toMatchObject({ contributors: [{ name: "Marraine" }] });
    const history = (await manage(owner, "GET", `/items/${scarf}/history`)).body as { type: string }[];
    expect(history.map((entry) => entry.type)).toContain("reserved");

    const late = await guest(link.body.token, "POST", `/items/${scarf}/contributions`, {
      payload: { guestName: "Retard" },
    });
    expect(late.body).toEqual({ error: "list_closed" });
    const withdraw = await guest(link.body.token, "DELETE", `/contributions/${made.body.contribution.id}`, {
      headers: { "x-withdraw-key": made.body.withdrawKey },
    });
    expect(withdraw.body).toEqual({ error: "list_closed" });
    expect((await manage(owner, "PATCH", `/lists/${list.id}`, { revealMode: "received" })).body).toEqual({
      error: "secret_already_lifted",
    });
    expect((await manage(cousin, "POST", `/lists/${list.id}/reveal`)).status).toBe(404);
  });
});
