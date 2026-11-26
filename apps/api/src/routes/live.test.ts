import { schema } from "@wishalia/db";
import { eq } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { liveState } from "../live.js";
import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../test/app.js";

const OTHER_EMAIL = "voisin@example.test";
let clock = new Date("2026-12-01T10:00:00Z");
let t: TestApp;
let owner: string;
let other: string;

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON answers, read field by field
  body: any;
  headers: Record<string, unknown>;
}

async function send(options: InjectOptions): Promise<Answer> {
  const response = await t.app.inject(options);
  return {
    status: response.statusCode,
    body: response.body ? response.json() : null,
    headers: response.headers,
  };
}
const manage = (
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: object,
) => send({ method, url: `/manage${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });
const guest = (token: string, method: NonNullable<InjectOptions["method"]>, url: string, payload?: object) =>
  send({
    method,
    url: `/public${url}`,
    headers: { "x-share-token": token, "x-forwarded-for": "203.0.113.9" },
    ...(payload ? { payload } : {}),
  });
const set = (id: string, values: Partial<typeof schema.wishes.$inferInsert>) =>
  t.db.update(schema.wishes).set(values).where(eq(schema.wishes.id, id));

let listId: string;
let lamp: string;
let book: string;
let token: string;
let eventToken: string;

beforeAll(async () => {
  t = await createTestApp({ OWNER_EMAILS: `${OWNER_EMAIL},${OTHER_EMAIL}` }, () => clock);
  owner = await signIn(t, OWNER_EMAIL);
  other = await signIn(t, OTHER_EMAIL);
  listId = (await manage(owner, "POST", "/lists", { name: "Noël" })).body.id;
  lamp = (await manage(owner, "POST", "/items", { input: "https://www.example.com/lampe", listId })).body.id;
  book = (await manage(owner, "POST", "/items", { input: "Un livre", listId })).body.id;
  token = (await manage(owner, "POST", "/share-links", { scope: "list", listId, audience: "Famille" })).body
    .token;
  const eventId = (await manage(owner, "POST", "/events", { name: "Noël", date: "2026-12-24" })).body.id;
  await manage(owner, "PUT", `/events/${eventId}/items/${lamp}`);
  eventToken = (await manage(owner, "POST", "/share-links", { scope: "event", eventId, audience: "Tous" }))
    .body.token;
}, 30_000);

afterAll(async () => {
  await t.close();
});

describe("the fingerprint", () => {
  const row = {
    id: "a",
    updatedAt: new Date("2026-12-01T10:00:00Z"),
    position: 0,
    status: "open" as const,
    imageId: null,
    enrichment: "running" as const,
    enrichmentStep: null,
  };

  it("is the same whatever the order, and moves with each step", () => {
    const other = { ...row, id: "b", enrichment: null };
    const state = liveState([row, other]);
    expect(state).toEqual({ version: expect.stringMatching(/^[\w-]{22}$/), live: 1 });
    expect(liveState([other, row]).version).toBe(state.version);
    expect(liveState([{ ...row, enrichmentStep: "images" }, other]).version).not.toBe(state.version);
    expect(liveState([{ ...row, enrichment: "done" }, other])).toMatchObject({ live: 0 });
    expect(liveState([])).toMatchObject({ live: 0 });
  });
});

describe("the management app's live answer", () => {
  it("counts the items on their way, never cached, and moves when one changes", async () => {
    const first = await manage(owner, "GET", `/lists/${listId}/live`);
    expect(first).toMatchObject({ status: 200, body: { live: 1 } });
    expect(first.headers["cache-control"]).toBe("private, no-store");

    await set(lamp, { enrichment: "running", enrichmentStep: "images", title: "Lampe", updatedAt: clock });
    const images = await manage(owner, "GET", `/lists/${listId}/live`);
    expect(images.body.live).toBe(1);
    expect(images.body.version).not.toBe(first.body.version);
    const items = (await manage(owner, "GET", `/lists/${listId}/items`)).body;
    expect(items.find((item: { id: string }) => item.id === lamp)).toMatchObject({
      enrichment: "pending",
      enrichmentStep: "images",
    });
    expect(items.find((item: { id: string }) => item.id === book)).toMatchObject({ enrichmentStep: null });

    await set(lamp, { enrichment: "done", enrichmentStep: null });
    expect((await manage(owner, "GET", `/lists/${listId}/live`)).body.live).toBe(0);
  });

  it("never moves when someone gives: the owner learns nothing (anti-spoil)", async () => {
    const before = (await manage(owner, "GET", `/lists/${listId}/live`)).body.version;
    const gift = await guest(token, "POST", `/items/${book}/contributions`, { guestName: "Mamie" });
    expect(gift.status).toBe(201);
    expect((await manage(owner, "GET", `/lists/${listId}/live`)).body.version).toBe(before);
  });

  it("is the owner's only, and needs a well-formed list", async () => {
    expect((await manage(other, "GET", `/lists/${listId}/live`)).status).toBe(404);
    expect((await manage(owner, "GET", "/lists/pas-une-liste/live")).status).toBe(400);
    expect((await send({ method: "GET", url: `/manage/lists/${listId}/live` })).status).toBe(401);
  });
});

describe("the guests' live answer", () => {
  it("follows the items of the link's list or event, and their step in the view", async () => {
    await set(lamp, { enrichment: "running", enrichmentStep: null });
    const list = await guest(token, "GET", "/live");
    expect(list).toMatchObject({ status: 200, body: { live: 1 } });
    expect(list.headers["cache-control"]).toBe("private, no-store");
    const view = (await guest(token, "GET", "/view")).body;
    expect(view.items.find((item: { id: string }) => item.id === lamp).stage).toBe("reading");
    expect(view.items.find((item: { id: string }) => item.id === book).stage).toBeNull();

    expect((await guest(eventToken, "GET", "/live")).body.live).toBe(1);
    // A link that cannot be read is the owner's business: the guests see nothing on its way
    await set(lamp, { enrichment: "failed" });
    expect((await guest(eventToken, "GET", "/live")).body.live).toBe(0);
    const failed = (await guest(token, "GET", "/view")).body;
    expect(failed.items.find((item: { id: string }) => item.id === lamp).stage).toBeNull();
  });

  it("answers the same 404 for an unknown link or an archived list", async () => {
    expect((await guest("x".repeat(43), "GET", "/live")).status).toBe(404);
    await t.db.update(schema.wishLists).set({ archivedAt: clock }).where(eq(schema.wishLists.id, listId));
    expect((await guest(token, "GET", "/live")).body).toEqual({ error: "link_not_found" });
    clock = new Date(clock.getTime() + 1000);
  });
});
