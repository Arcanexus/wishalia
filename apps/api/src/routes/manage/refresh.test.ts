import { schema } from "@wishalia/db";
import { REFRESH_SPACING_MS } from "@wishalia/domain";
import { eq } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../../test/app.js";
import { ITEM_REFRESHES_PER_MINUTE, LIST_REFRESHES_PER_MINUTE } from "./refresh.js";

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

async function add(input: string, listId?: string) {
  const { body } = await as(owner, "POST", "/items", { input, ...(listId ? { listId } : {}) });
  return body as { id: string; listId: string };
}

/** As if the worker had read the item. */
async function done(id: string) {
  await t.db
    .update(schema.wishes)
    .set({ enrichment: "done", enrichmentAttempts: 1 })
    .where(eq(schema.wishes.id, id));
}
const row = async (id: string) => {
  const [wish] = await t.db.select().from(schema.wishes).where(eq(schema.wishes.id, id));
  if (!wish) throw new Error("no item");
  return wish;
};
const minuteLater = () => (clock = new Date(clock.getTime() + 61_000));

describe("reading an item's link again", () => {
  it("puts the item back in the queue, with its history entry", async () => {
    const item = await add("https://www.example.com/lampe");
    await done(item.id);
    const refreshed = await as(owner, "POST", `/items/${item.id}/refresh`);
    expect(refreshed).toMatchObject({ status: 200, body: { id: item.id, enrichment: "pending" } });
    expect(await row(item.id)).toMatchObject({
      enrichment: "pending",
      enrichmentAttempts: 0,
      enrichmentAt: null,
    });
    const history = (await as(owner, "GET", `/items/${item.id}/history`)).body as { type: string }[];
    expect(history.map((entry) => entry.type)).toContain("refresh_requested");
  });

  it("changes nothing while the item is being read", async () => {
    const item = await add("https://www.example.com/pending");
    const again = await as(owner, "POST", `/items/${item.id}/refresh`);
    expect(again).toMatchObject({ status: 200, body: { enrichment: "pending" } });
    const history = (await as(owner, "GET", `/items/${item.id}/history`)).body as { type: string }[];
    expect(history.map((entry) => entry.type)).toEqual(["created"]);
  });

  it("refuses an item without a link, and hides someone else's", async () => {
    const words = await add("Un pull bleu");
    expect(await as(owner, "POST", `/items/${words.id}/refresh`)).toMatchObject({
      status: 409,
      body: { error: "no_link" },
    });
    expect((await as(other, "POST", `/items/${words.id}/refresh`)).status).toBe(404);
    expect((await as(owner, "POST", "/items/nope/refresh")).status).toBe(400);
  });

  it("limits how often an owner asks", async () => {
    minuteLater();
    const item = await add("https://www.example.com/many");
    for (let index = 0; index < ITEM_REFRESHES_PER_MINUTE; index += 1) {
      await done(item.id);
      expect((await as(owner, "POST", `/items/${item.id}/refresh`)).status).toBe(200);
    }
    await done(item.id);
    expect(await as(owner, "POST", `/items/${item.id}/refresh`)).toMatchObject({
      status: 429,
      body: { error: "rate_limited" },
    });
    minuteLater();
    expect((await as(owner, "POST", `/items/${item.id}/refresh`)).status).toBe(200);
  });
});

describe("reading a whole list again", () => {
  it("queues its open items with a link, spaced site by site", async () => {
    const list = (await as(owner, "POST", "/lists", { name: "Noël" })).body as { id: string };
    const a = await add("https://www.amazon.fr/dp/1", list.id);
    const b = await add("https://www.amazon.fr/dp/2", list.id);
    const c = await add("https://www.fnac.com/x", list.id);
    const words = await add("Des chaussettes", list.id);
    const received = await add("https://www.amazon.fr/dp/3", list.id);
    const reading = await add("https://www.example.com/reading", list.id);
    for (const item of [a, b, c, received]) await done(item.id);
    await as(owner, "PATCH", `/items/${received.id}`, { status: "received" });

    const result = await as(owner, "POST", `/lists/${list.id}/refresh`);
    expect(result).toMatchObject({ status: 200, body: { queued: 3 } });
    const times = await Promise.all(
      [a, b, c].map(async (item) => (await row(item.id)).enrichmentAt?.getTime()),
    );
    // Newest first in the list: b before a on amazon.fr, fnac.com on its own
    expect(times.toSorted()).toEqual([
      clock.getTime(),
      clock.getTime(),
      clock.getTime() + REFRESH_SPACING_MS,
    ]);
    expect((await row(c.id)).enrichmentAt?.getTime()).toBe(clock.getTime());
    expect(await row(words.id)).toMatchObject({ enrichment: null });
    expect(await row(received.id)).toMatchObject({ enrichment: "done" });
    expect(await row(reading.id)).toMatchObject({ enrichment: "pending", enrichmentAt: null });
  });

  it("limits how often an owner asks, and hides someone else's list", async () => {
    minuteLater();
    const list = (await as(owner, "POST", "/lists", { name: "Anniversaire" })).body as { id: string };
    expect((await as(other, "POST", `/lists/${list.id}/refresh`)).status).toBe(404);
    for (let index = 0; index < LIST_REFRESHES_PER_MINUTE; index += 1) {
      expect(await as(owner, "POST", `/lists/${list.id}/refresh`)).toMatchObject({
        status: 200,
        body: { queued: 0 },
      });
    }
    expect((await as(owner, "POST", `/lists/${list.id}/refresh`)).status).toBe(429);
  });
});
