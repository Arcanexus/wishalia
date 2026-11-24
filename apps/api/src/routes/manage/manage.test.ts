import { schema } from "@wishalia/db";
import { eq } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../../test/app.js";

const OTHER_EMAIL = "other-owner@example.test";
let clock = new Date("2026-12-20T10:00:00Z");
let t: TestApp;
let owner: string;
let other: string;

beforeAll(async () => {
  t = await createTestApp({ OWNER_EMAILS: `${OWNER_EMAIL},${OTHER_EMAIL}` }, () => clock);
  owner = await signIn(t, OWNER_EMAIL);
  other = await signIn(t, OTHER_EMAIL);
}, 30_000);

afterAll(async () => {
  await t.close();
});

/** A /manage request as someone (their session cookie). */
async function as(
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: object,
) {
  const options: InjectOptions = { method, url: `/manage${url}`, headers: { cookie } };
  if (payload) options.payload = payload as Record<string, unknown>;
  const response = await t.app.inject(options);
  return { status: response.statusCode, body: response.body ? response.json() : null };
}

async function quickAdd(cookie: string, input: string, listId?: string) {
  const { status, body } = await as(cookie, "POST", "/items", { input, ...(listId ? { listId } : {}) });
  expect(status).toBe(201);
  return body as { id: string; listId: string; title: string; url: string | null; duplicateOf: string[] };
}

async function history(cookie: string, itemId: string) {
  return (await as(cookie, "GET", `/items/${itemId}/history`)).body as {
    type: string;
    payload: Record<string, unknown>;
  }[];
}

describe("me", () => {
  it("gives the person with their display settings, and keeps their changes", async () => {
    expect((await as(owner, "GET", "/me")).body).toMatchObject({
      email: OWNER_EMAIL,
      theme: "auto",
      mode: "device",
    });
    const changed = await as(owner, "PATCH", "/me", {
      theme: "christmas",
      mode: "dark",
      displayName: "  Alex ",
    });
    expect(changed.body).toMatchObject({ displayName: "Alex", theme: "christmas", mode: "dark" });
    expect((await as(owner, "GET", "/me")).body).toMatchObject({ theme: "christmas", mode: "dark" });
    // Only their own row
    expect((await as(other, "GET", "/me")).body).toMatchObject({ theme: "auto", mode: "device" });
    await as(owner, "PATCH", "/me", { theme: "auto", mode: "device" });
  });

  it("refuses an unknown setting or field", async () => {
    expect((await as(owner, "PATCH", "/me", { theme: "pink" })).status).toBe(400);
    expect((await as(owner, "PATCH", "/me", { mode: "sepia" })).status).toBe(400);
    expect((await as(owner, "PATCH", "/me", { email: "x@y.test" })).status).toBe(400);
    expect((await as(owner, "PATCH", "/me", { displayName: " " })).status).toBe(400);
  });
});

describe("lists", () => {
  it("creates lists in order and lists them with their open items", async () => {
    const books = (await as(owner, "POST", "/lists", { name: "  Livres " })).body;
    const home = (await as(owner, "POST", "/lists", { name: "Maison" })).body;
    expect(books).toMatchObject({ name: "Livres", position: 0, itemCount: 0 });
    expect(home.position).toBe(1);
    await quickAdd(owner, "Dune", books.id);

    const lists = (await as(owner, "GET", "/lists")).body;
    expect(lists.map((list: { name: string }) => list.name)).toEqual(["Livres", "Maison"]);
    expect(lists[0].itemCount).toBe(1);
  });

  it("renames, reorders and archives a list", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "Brouillon" })).body;
    expect((await as(owner, "PATCH", `/lists/${list.id}`, { name: "Jeux", position: 9 })).body).toMatchObject(
      {
        name: "Jeux",
        position: 9,
      },
    );
    await as(owner, "PATCH", `/lists/${list.id}`, { archived: true });
    const names = (await as(owner, "GET", "/lists")).body.map((item: { name: string }) => item.name);
    expect(names).not.toContain("Jeux");
  });

  it("puts a list's open items in a new order, all of them or none", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "À trier" })).body;
    const a = await quickAdd(owner, "Un", list.id);
    const b = await quickAdd(owner, "Deux", list.id);
    const c = await quickAdd(owner, "Trois", list.id);
    const done = await quickAdd(owner, "Reçu", list.id);
    await as(owner, "PATCH", `/items/${done.id}`, { status: "received" });
    const titles = async () =>
      ((await as(owner, "GET", `/lists/${list.id}/items`)).body as { title: string }[]).map(
        (item) => item.title,
      );
    // Newest first by default
    expect(await titles()).toEqual(["Trois", "Deux", "Un", "Reçu"]);

    const order = (itemIds: string[]) => as(owner, "PUT", `/lists/${list.id}/order`, { itemIds });
    expect((await order([a.id, c.id, b.id])).status).toBe(204);
    expect(await titles()).toEqual(["Un", "Trois", "Deux", "Reçu"]);
    expect(await history(owner, a.id)).toHaveLength(1);

    // Missing, repeated, foreign or closed items: the list changed meanwhile, nothing moves
    for (const ids of [
      [a.id, b.id],
      [a.id, a.id, b.id],
      [a.id, b.id, c.id, done.id],
    ]) {
      expect(await order(ids)).toMatchObject({ status: 409, body: { error: "order_changed" } });
    }
    expect(await titles()).toEqual(["Un", "Trois", "Deux", "Reçu"]);
    expect((await order([])).status).toBe(400);
    expect((await as(other, "PUT", `/lists/${list.id}/order`, { itemIds: [a.id, b.id, c.id] })).status).toBe(
      404,
    );
  });

  it("forces a theme on a list, or lets each person choose", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "Noël des enfants" })).body;
    expect(list.theme).toBeNull();
    expect((await as(owner, "PATCH", `/lists/${list.id}`, { theme: "christmas" })).body.theme).toBe(
      "christmas",
    );
    expect((await as(owner, "PATCH", `/lists/${list.id}`, { theme: null })).body.theme).toBeNull();
    expect((await as(owner, "PATCH", `/lists/${list.id}`, { theme: "pink" })).status).toBe(400);
  });

  it("refuses an empty name and unknown fields", async () => {
    expect((await as(owner, "POST", "/lists", { name: " " })).status).toBe(400);
    const list = (await as(owner, "POST", "/lists", { name: "X" })).body;
    const response = await as(owner, "PATCH", `/lists/${list.id}`, { ownerId: "someone" });
    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_request");
  });

  it("hides the lists of another owner behind a 404", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "Secret" })).body;
    expect((await as(other, "GET", `/lists/${list.id}/items`)).status).toBe(404);
    expect((await as(other, "PATCH", `/lists/${list.id}`, { name: "pwned" })).status).toBe(404);
    expect((await as(other, "GET", "/lists")).body.map((item: { id: string }) => item.id)).not.toContain(
      list.id,
    );
  });

  it("answers 400 for an id that is not a uuid", async () => {
    expect((await as(owner, "GET", "/lists/not-a-uuid/items")).status).toBe(400);
  });
});

describe("quick add", () => {
  it("creates the first list of a new owner", async () => {
    const fresh = await createTestApp({}, () => clock);
    try {
      const cookie = await signIn(fresh, OWNER_EMAIL);
      const response = await fresh.app.inject({
        method: "POST",
        url: "/manage/items",
        headers: { cookie },
        payload: { input: "Un pull bleu" },
      });
      expect(response.statusCode).toBe(201);
      const lists = await fresh.app.inject({ method: "GET", url: "/manage/lists", headers: { cookie } });
      expect(lists.json()).toEqual([expect.objectContaining({ name: "Mes envies", itemCount: 1 })]);
    } finally {
      await fresh.close();
    }
  }, 30_000);

  it("takes a URL, cleans it and waits for the enrichment with the site name", async () => {
    const item = await quickAdd(owner, "https://www.fnac.com/a1?utm_source=mail#top");
    expect(item).toMatchObject({
      title: "fnac.com",
      url: "https://www.fnac.com/a1",
      kind: "unique",
      status: "open",
    });
  });

  it("puts new items first", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "Ordre" })).body;
    await quickAdd(owner, "premier", list.id);
    await quickAdd(owner, "second", list.id);
    const titles = (await as(owner, "GET", `/lists/${list.id}/items`)).body.map(
      (item: { title: string }) => item.title,
    );
    expect(titles).toEqual(["second", "premier"]);
  });

  it("flags a link already wished for, without refusing it", async () => {
    const first = await quickAdd(owner, "https://example.com/lego");
    const again = await quickAdd(owner, "https://example.com/lego?fbclid=x");
    expect(again.duplicateOf).toEqual([first.id]);
  });

  it("writes the creation into the history", async () => {
    const item = await quickAdd(owner, "Casque audio");
    expect(await history(owner, item.id)).toEqual([
      expect.objectContaining({ type: "created", payload: { title: "Casque audio", url: null } }),
    ]);
  });

  it("refuses an empty input and a list of someone else", async () => {
    expect((await as(owner, "POST", "/items", { input: "   " })).status).toBe(400);
    const list = (await as(other, "POST", "/lists", { name: "À moi" })).body;
    expect((await as(owner, "POST", "/items", { input: "x", listId: list.id })).status).toBe(404);
  });
});

describe("editing an item", () => {
  it("writes the diff, and a price change on its own", async () => {
    const item = await quickAdd(owner, "Pull");
    const updated = await as(owner, "PATCH", `/items/${item.id}`, {
      title: "Pull bleu",
      notes: "taille M",
      priceCents: 4500,
    });
    expect(updated.body).toMatchObject({ title: "Pull bleu", notes: "taille M", priceCents: 4500 });

    await as(owner, "PATCH", `/items/${item.id}`, { priceCents: 3900 });
    const entries = await history(owner, item.id);
    expect(entries.map((entry) => entry.type)).toEqual([
      "created",
      "updated",
      "price_changed",
      "price_changed",
    ]);
    expect(entries[1]?.payload).toEqual({
      changes: { title: { from: "Pull", to: "Pull bleu" }, notes: { from: null, to: "taille M" } },
    });
    expect(entries[3]?.payload).toEqual({ from: 4500, to: 3900 });
  });

  it("writes nothing when nothing changes", async () => {
    const item = await quickAdd(owner, "Rien");
    await as(owner, "PATCH", `/items/${item.id}`, { title: "Rien" });
    expect(await history(owner, item.id)).toHaveLength(1);
  });

  it("moves an item to another list of the owner, never to someone else's", async () => {
    const item = await quickAdd(owner, "Lampe");
    const target = (await as(owner, "POST", "/lists", { name: "Déco" })).body;
    expect((await as(owner, "PATCH", `/items/${item.id}`, { listId: target.id })).body.listId).toBe(
      target.id,
    );
    expect((await history(owner, item.id)).at(-1)).toMatchObject({
      type: "moved",
      payload: { from: item.listId, to: target.id },
    });

    const foreign = (await as(other, "POST", "/lists", { name: "Ailleurs" })).body;
    expect((await as(owner, "PATCH", `/items/${item.id}`, { listId: foreign.id })).status).toBe(404);
  });

  it("marks an item received, then archived, then open again", async () => {
    const item = await quickAdd(owner, "Vélo");
    await as(owner, "PATCH", `/items/${item.id}`, { status: "received" });
    await as(owner, "PATCH", `/items/${item.id}`, { status: "archived" });
    await as(owner, "PATCH", `/items/${item.id}`, { status: "open" });
    expect((await history(owner, item.id)).map((entry) => entry.type)).toEqual([
      "created",
      "received",
      "archived",
      "updated",
    ]);
  });

  it("never marks a repeatable item received", async () => {
    const item = await quickAdd(owner, "Chocolats");
    await as(owner, "PATCH", `/items/${item.id}`, { repeatable: true });
    const response = await as(owner, "PATCH", `/items/${item.id}`, { status: "received" });
    expect(response.status).toBe(409);
    expect(response.body.error).toBe("repeatable_never_received");
  });

  it("cleans a new URL and refuses an unsafe one", async () => {
    const item = await quickAdd(owner, "Livre");
    expect(
      (await as(owner, "PATCH", `/items/${item.id}`, { url: "https://ex.com/b?utm_x=1" })).body.url,
    ).toBe("https://ex.com/b");
    expect((await as(owner, "PATCH", `/items/${item.id}`, { url: "javascript:alert(1)" })).status).toBe(400);
    expect((await as(owner, "PATCH", `/items/${item.id}`, { url: null })).body.url).toBeNull();
  });

  it("needs a quantity for a quantity item", async () => {
    const item = await quickAdd(owner, "Verres");
    expect((await as(owner, "PATCH", `/items/${item.id}`, { kind: "quantity" })).status).toBe(400);
    expect(
      (await as(owner, "PATCH", `/items/${item.id}`, { kind: "quantity", quantity: 6 })).body,
    ).toMatchObject({
      kind: "quantity",
      quantity: 6,
    });
  });

  it("reorders without writing history", async () => {
    const item = await quickAdd(owner, "Ordre");
    expect((await as(owner, "PATCH", `/items/${item.id}`, { position: 42 })).body.position).toBe(42);
    expect(await history(owner, item.id)).toHaveLength(1);
  });

  it("hides the items of another owner behind a 404", async () => {
    const item = await quickAdd(owner, "Privé");
    expect((await as(other, "GET", `/items/${item.id}`)).status).toBe(404);
    expect((await as(other, "PATCH", `/items/${item.id}`, { title: "x" })).status).toBe(404);
    expect((await as(other, "GET", `/items/${item.id}/history`)).status).toBe(404);
    expect((await as(owner, "GET", `/items/${item.id}`)).body.title).toBe("Privé");
  });
});

describe("events", () => {
  it("creates an event with the default reveal delay", async () => {
    const { status, body } = await as(owner, "POST", "/events", {
      name: "Noël",
      kind: "christmas",
      date: "2026-12-25",
    });
    expect(status).toBe(201);
    expect(body).toMatchObject({
      revealDelayDays: 3,
      revealAvailableAt: "2026-12-29T00:00:00.000Z",
      canReveal: false,
      secretLifted: false,
    });
  });

  it("selects and unselects items, idempotently, with their history", async () => {
    const event = (
      await as(owner, "POST", "/events", { name: "Anniversaire", kind: "birthday", date: "2027-03-01" })
    ).body;
    const item = await quickAdd(owner, "Puzzle");
    expect((await as(owner, "PUT", `/events/${event.id}/items/${item.id}`)).status).toBe(204);
    expect((await as(owner, "PUT", `/events/${event.id}/items/${item.id}`)).status).toBe(204);
    expect(
      (await as(owner, "GET", `/events/${event.id}/items`)).body.map((row: { id: string }) => row.id),
    ).toEqual([item.id]);
    expect((await as(owner, "DELETE", `/events/${event.id}/items/${item.id}`)).status).toBe(204);
    expect((await as(owner, "DELETE", `/events/${event.id}/items/${item.id}`)).status).toBe(404);
    expect((await history(owner, item.id)).map((entry) => entry.type)).toEqual([
      "created",
      "added_to_event",
      "removed_from_event",
    ]);
  });

  it("keeps events and their items to their owner", async () => {
    const event = (await as(owner, "POST", "/events", { name: "Perso", date: "2027-01-01" })).body;
    const foreignItem = await quickAdd(other, "Autre");
    expect((await as(other, "GET", `/events/${event.id}/items`)).status).toBe(404);
    expect((await as(owner, "PUT", `/events/${event.id}/items/${foreignItem.id}`)).status).toBe(404);
    expect((await as(other, "POST", `/events/${event.id}/reveal`)).status).toBe(404);
  });

  it("refuses a date that is not a day", async () => {
    expect((await as(owner, "POST", "/events", { name: "x", date: "25/12/2026" })).status).toBe(400);
  });
});

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

describe("anti-spoil on /manage", () => {
  it("never returns contributions, and seals them in the history until the secret is lifted", async () => {
    clock = new Date("2026-12-20T10:00:00Z");
    const event = (
      await as(owner, "POST", "/events", { name: "Noël famille", kind: "christmas", date: "2026-12-25" })
    ).body;
    const item = await quickAdd(owner, "Robot cuisine");
    await as(owner, "PATCH", `/items/${item.id}`, { kind: "pool", targetCents: 30000 });
    await as(owner, "PUT", `/events/${event.id}/items/${item.id}`);

    // A guest pledges 50 € (the public API comes next: written straight to the database here)
    const [contribution] = await t.db
      .insert(schema.contributions)
      .values({ wishId: item.id, eventId: event.id, guestName: "Mamie", amountCents: 5000 })
      .returning();
    await t.db.insert(schema.itemEvents).values({
      wishId: item.id,
      type: "contribution_added",
      payload: { eventId: event.id, contributionId: contribution?.id, amountCents: 5000, guestName: "Mamie" },
      visibility: "sealed",
    });
    // A sealed entry tied to no event is never shown to the owner
    await t.db.insert(schema.itemEvents).values({ wishId: item.id, type: "reserved", visibility: "sealed" });
    // A guests-only entry is never shown to the owner either
    await t.db
      .insert(schema.itemEvents)
      .values({ wishId: item.id, type: "reserved", payload: { eventId: event.id }, visibility: "guests" });

    for (const url of [
      `/items/${item.id}`,
      `/lists/${item.listId}/items`,
      `/events/${event.id}/items`,
      "/lists",
    ]) {
      // Random ids are left out: one may hold "5000" by chance
      const text = JSON.stringify((await as(owner, "GET", url)).body).replaceAll(UUID, "<id>");
      expect(text, url).not.toMatch(/Mamie|5000|contribut|amount/i);
    }
    expect((await history(owner, item.id)).map((entry) => entry.type)).not.toContain("contribution_added");

    // Too early: the secret holds until the end of the 25th plus 3 days
    clock = new Date("2026-12-28T23:59:00Z");
    expect((await as(owner, "POST", `/events/${event.id}/reveal`)).body).toEqual({
      error: "too_early",
      availableAt: "2026-12-29T00:00:00.000Z",
    });
    expect((await history(owner, item.id)).map((entry) => entry.type)).not.toContain("contribution_added");

    // Possible, but not lifted yet: still sealed
    clock = new Date("2026-12-29T08:00:00Z");
    expect(
      (await as(owner, "GET", "/events")).body.find((row: { id: string }) => row.id === event.id),
    ).toMatchObject({
      canReveal: true,
      secretLifted: false,
    });
    expect((await history(owner, item.id)).map((entry) => entry.type)).not.toContain("contribution_added");

    // Lifted: the owner now sees who gave what in the history
    expect((await as(owner, "POST", `/events/${event.id}/reveal`)).body).toMatchObject({
      secretLifted: true,
    });
    const entries = await history(owner, item.id);
    expect(entries.find((entry) => entry.type === "contribution_added")?.payload).toMatchObject({
      guestName: "Mamie",
    });
    expect(entries.filter((entry) => entry.type === "reserved")).toEqual([]);

    // Revealing twice changes nothing; the date is then frozen
    expect((await as(owner, "POST", `/events/${event.id}/reveal`)).status).toBe(200);
    expect((await as(owner, "PATCH", `/events/${event.id}`, { date: "2027-12-25" })).status).toBe(409);
    expect((await as(owner, "PATCH", `/events/${event.id}`, { name: "Noël 2026" })).body).toMatchObject({
      name: "Noël 2026",
      kind: "christmas",
      revealDelayDays: 3,
    });

    const [stored] = await t.db.select().from(schema.events).where(eq(schema.events.id, event.id));
    expect(stored?.revealedAt?.toISOString()).toBe("2026-12-29T08:00:00.000Z");
  });
});

describe("errors", () => {
  it("never leaks an internal error", async () => {
    const broken = await createTestApp({}, () => clock);
    try {
      const cookie = await signIn(broken, OWNER_EMAIL);
      const db = broken.db as unknown as { select: () => never };
      db.select = () => {
        throw new Error("password=hunter2 at db.internal:5432");
      };
      const response = await broken.app.inject({ method: "GET", url: "/manage/lists", headers: { cookie } });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "internal" });
    } finally {
      await broken.close();
    }
  }, 30_000);

  it("answers a malformed JSON body with a 400", async () => {
    const response = await t.app.inject({
      method: "POST",
      url: "/manage/lists",
      headers: { cookie: owner, "content-type": "application/json" },
      payload: "{not json",
    });
    expect(response.statusCode).toBe(400);
  });
});
