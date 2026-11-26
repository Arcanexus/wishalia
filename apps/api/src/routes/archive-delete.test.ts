import { schema } from "@wishalia/db";
import { memoryStorage } from "@wishalia/storage";
import { eq } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../test/app.js";

const FAMILY_EMAIL = "cousin@example.test";
const API_HOST = "api.wishalia.test";
const hex = "ab".repeat(32);
const storage = memoryStorage();
let clock = new Date("2026-12-01T10:00:00Z");
let t: TestApp;
let owner: string;
let cousin: string;

beforeAll(async () => {
  t = await createTestApp(
    { OWNER_EMAILS: `${OWNER_EMAIL},${FAMILY_EMAIL}`, API_ORIGIN: `https://${API_HOST}` },
    () => clock,
    { storage, imgproxy: { key: hex, salt: hex, source: "s3://wishalia/" } },
  );
  owner = await signIn(t, OWNER_EMAIL);
  cousin = await signIn(t, FAMILY_EMAIL);
}, 30_000);

afterAll(async () => {
  await t.close();
});

async function send(options: InjectOptions) {
  const response = await t.app.inject(options);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON answers, read field by field
  return { status: response.statusCode, body: (response.body ? response.json() : null) as any };
}

const manage = (
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: object,
) => send({ method, url: `/manage${url}`, headers: { cookie }, ...(payload ? { payload } : {}) });

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

async function newList(name: string) {
  const list = await manage(owner, "POST", "/lists", { name });
  expect(list.status).toBe(201);
  return list.body.id as string;
}

async function newItem(input: string, listId: string) {
  const created = await manage(owner, "POST", "/items", { input, listId });
  expect(created.status).toBe(201);
  return created.body.id as string;
}

async function linkTo(listId: string) {
  const link = await manage(owner, "POST", "/share-links", { scope: "list", listId, audience: "Mamie" });
  expect(link.status).toBe(201);
  return link.body.token as string;
}

const typesOf = async (itemId: string) =>
  (await t.db.select().from(schema.itemEvents).where(eq(schema.itemEvents.wishId, itemId))).map((entry) => ({
    type: entry.type,
    visibility: entry.visibility,
  }));

describe("archived lists", () => {
  it("are out of the lists, listed apart, and restored as they were", async () => {
    const listId = await newList("Rangée");
    await newItem("Toupie", listId);
    const token = await linkTo(listId);
    expect((await manage(owner, "PATCH", `/lists/${listId}`, { archived: true })).body.archivedAt).toBe(
      clock.toISOString(),
    );
    const names = async (query = "") =>
      (await manage(owner, "GET", `/lists${query}`)).body.map((list: { name: string }) => list.name);
    expect(await names()).not.toContain("Rangée");
    expect(await names("?archived=true")).toEqual(["Rangée"]);
    expect((await manage(owner, "GET", "/lists?archived=maybe")).status).toBe(400);
    // The guests no longer open it
    expect((await guest(token, "GET", "/view")).status).toBe(404);

    expect(
      (await manage(owner, "PATCH", `/lists/${listId}`, { archived: false })).body.archivedAt,
    ).toBeNull();
    expect(await names()).toContain("Rangée");
    expect(await names("?archived=true")).toEqual([]);
    const view = await guest(token, "GET", "/view");
    expect(view.status).toBe(200);
    expect(view.body.items.map((item: { title: string }) => item.title)).toEqual(["Toupie"]);
  });
});

describe("an archived list seen through an event link", () => {
  it("leaves its items out of the event too", async () => {
    const listId = await newList("Bureau");
    const pen = await newItem("Stylo", listId);
    const event = (await manage(owner, "POST", "/events", { name: "Fête", date: "2026-12-30" })).body
      .id as string;
    await manage(owner, "PUT", `/events/${event}/items/${pen}`);
    const link = await manage(owner, "POST", "/share-links", {
      scope: "event",
      eventId: event,
      audience: "Tous",
    });
    const titles = async () =>
      (await guest(link.body.token, "GET", "/view")).body.items.map((item: { title: string }) => item.title);
    expect(await titles()).toEqual(["Stylo"]);
    await manage(owner, "PATCH", `/lists/${listId}`, { archived: true });
    expect(await titles()).toEqual([]);
    expect(
      (await guest(link.body.token, "POST", `/items/${pen}/contributions`, { payload: { guestName: "A" } }))
        .status,
    ).toBe(404);
  });
});

describe("deleting an item", () => {
  it("takes it out of everything for good, images, events and links included", async () => {
    const listId = await newList("Chambre");
    const lamp = await newItem("Lampe https://shop.example/lamp", listId);
    const kept = await newItem("Coussin", listId);
    const event = (
      await manage(owner, "POST", "/events", { name: "Noël", kind: "christmas", date: "2026-12-24" })
    ).body.id as string;
    expect((await manage(owner, "PUT", `/events/${event}/items/${lamp}`)).status).toBe(204);
    // An image the owner sent
    const [image] = await t.db
      .insert(schema.wishImages)
      .values({
        wishId: lamp,
        source: "upload",
        key: "wishes/lamp.webp",
        contentType: "image/webp",
        bytes: 3,
      })
      .returning();
    await t.db
      .update(schema.wishes)
      .set({ imageId: image?.id ?? null })
      .where(eq(schema.wishes.id, lamp));
    await storage.put("wishes/lamp.webp", new Uint8Array([1, 2, 3]), "image/webp");
    const token = await linkTo(listId);

    expect((await manage(cousin, "DELETE", `/items/${lamp}`)).status).toBe(404);
    expect((await manage(owner, "DELETE", `/items/${lamp}`)).status).toBe(204);
    expect((await manage(owner, "DELETE", `/items/${lamp}`)).status).toBe(404);
    expect((await manage(owner, "GET", `/items/${lamp}`)).status).toBe(404);
    expect((await manage(owner, "PATCH", `/items/${lamp}`, { status: "open" })).status).toBe(404);
    expect((await manage(owner, "GET", `/items/${lamp}/history`)).status).toBe(404);
    expect((await manage(owner, "PUT", `/events/${event}/items/${lamp}`)).status).toBe(404);
    const items = (await manage(owner, "GET", `/lists/${listId}/items`)).body;
    expect(items.map((item: { id: string }) => item.id)).toEqual([kept]);
    expect((await manage(owner, "GET", `/events/${event}/items`)).body).toEqual([]);
    expect((await guest(token, "GET", "/view")).body.items.map((item: { id: string }) => item.id)).toEqual([
      kept,
    ]);

    const [row] = await t.db.select().from(schema.wishes).where(eq(schema.wishes.id, lamp));
    expect(row).toMatchObject({
      status: "archived",
      url: null,
      imageId: null,
      enrichment: null,
      title: "Lampe",
    });
    expect(row?.deletedAt).toEqual(clock);
    expect(await t.db.select().from(schema.wishImages).where(eq(schema.wishImages.wishId, lamp))).toEqual([]);
    expect(storage.objects.has("wishes/lamp.webp")).toBe(false);
    // The history keeps its entries and gets one more
    expect((await typesOf(lamp)).map((entry) => entry.type)).toEqual([
      "created",
      "added_to_event",
      "deleted",
    ]);
  });

  it("cancels the gifts still pledged, tells their guests, and tells the owner nothing", async () => {
    const listId = await newList("Anniversaire");
    const bike = await newItem("Vélo", listId);
    const token = await linkTo(listId);
    const keyed = await guest(token, "POST", `/items/${bike}/contributions`, {
      payload: { guestName: "Mamie" },
    });
    expect(keyed.status).toBe(201);
    const gift = { id: keyed.body.contribution.id as string, key: keyed.body.withdrawKey as string };

    // Archived first: the gift is kept, its guest is told and may take it back
    await manage(owner, "PATCH", `/items/${bike}`, { status: "archived" });
    const archived = await guest(token, "POST", "/gifts/gone", { payload: { gifts: [gift] } });
    expect(archived.body).toEqual([
      expect.objectContaining({ id: gift.id, itemId: bike, title: "Vélo", state: "archived" }),
    ]);
    // Someone else, without the key, learns nothing
    expect(
      (
        await guest(token, "POST", "/gifts/gone", {
          payload: { gifts: [{ id: gift.id, key: "b".repeat(43) }] },
        })
      ).body,
    ).toEqual([]);
    expect((await guest(token, "POST", "/gifts/gone", { payload: {} })).body).toEqual([]);

    // Restored, then deleted: the deletion cancels the gift
    await manage(owner, "PATCH", `/items/${bike}`, { status: "open" });
    expect((await guest(token, "POST", "/gifts/gone", { payload: { gifts: [gift] } })).body).toEqual([]);
    const answer = await manage(owner, "DELETE", `/items/${bike}`);
    expect(answer).toEqual({ status: 204, body: null });
    const [contribution] = await t.db
      .select()
      .from(schema.contributions)
      .where(eq(schema.contributions.id, gift.id));
    expect(contribution).toMatchObject({ status: "withdrawn", withdrawnAt: clock });
    expect(await typesOf(bike)).toContainEqual({ type: "contribution_withdrawn", visibility: "sealed" });
    expect((await guest(token, "POST", "/gifts/gone", { payload: { gifts: [gift] } })).body).toEqual([
      expect.objectContaining({ id: gift.id, title: "Vélo", state: "deleted" }),
    ]);
    // Taking it back after that changes nothing more: the item is gone
    expect(
      (await guest(token, "DELETE", `/contributions/${gift.id}`, { headers: { "x-withdraw-key": gift.key } }))
        .status,
    ).toBe(404);
  });

  it("tells a family member by their account", async () => {
    const listId = await newList("Cuisine");
    const pan = await newItem("Poêle", listId);
    const token = await linkTo(listId);
    const made = await guest(token, "POST", `/items/${pan}/contributions`, { cookie: cousin, payload: {} });
    expect(made.status).toBe(201);
    await manage(owner, "DELETE", `/items/${pan}`);
    expect((await guest(token, "POST", "/gifts/gone", { cookie: cousin, payload: {} })).body).toEqual([
      expect.objectContaining({ itemId: pan, state: "deleted" }),
    ]);
  });
});

describe("taking back a gift of an archived item", () => {
  it("works with the key, and the item comes back free when restored", async () => {
    const listId = await newList("Jardin");
    const hose = await newItem("Tuyau", listId);
    const token = await linkTo(listId);
    const made = await guest(token, "POST", `/items/${hose}/contributions`, {
      payload: { guestName: "Papi" },
    });
    await manage(owner, "PATCH", `/items/${hose}`, { status: "archived" });
    const withdraw = await guest(token, "DELETE", `/contributions/${made.body.contribution.id}`, {
      headers: { "x-withdraw-key": made.body.withdrawKey },
    });
    expect(withdraw.status).toBe(204);
    await manage(owner, "PATCH", `/items/${hose}`, { status: "open" });
    const view = (await guest(token, "GET", "/view")).body;
    expect(view.items[0].funding.state).toBe("free");
  });
});

describe("deleting a list", () => {
  it("deletes it with its items, revokes its links, and answers 404 after", async () => {
    const listId = await newList("Vieille liste");
    const top = await newItem("Toupie", listId);
    const token = await linkTo(listId);
    await manage(owner, "PATCH", `/lists/${listId}`, { archived: true });
    expect((await manage(cousin, "DELETE", `/lists/${listId}`)).status).toBe(404);
    expect((await manage(owner, "DELETE", `/lists/${listId}`)).status).toBe(204);
    expect((await manage(owner, "DELETE", `/lists/${listId}`)).status).toBe(404);
    for (const query of ["", "?archived=true"]) {
      const names = (await manage(owner, "GET", `/lists${query}`)).body.map(
        (list: { id: string }) => list.id,
      );
      expect(names).not.toContain(listId);
    }
    expect((await manage(owner, "PATCH", `/lists/${listId}`, { archived: false })).status).toBe(404);
    expect((await manage(owner, "GET", `/lists/${listId}/items`)).status).toBe(404);
    expect((await manage(owner, "POST", "/items", { input: "Encore", listId })).status).toBe(404);
    expect(
      (await manage(owner, "POST", "/share-links", { scope: "list", listId, audience: "Tous" })).status,
    ).toBe(404);
    expect((await manage(owner, "POST", `/lists/${listId}/refresh`)).status).toBe(404);
    expect((await guest(token, "GET", "/view")).status).toBe(404);
    expect((await manage(owner, "GET", `/items/${top}`)).status).toBe(404);
    const [list] = await t.db.select().from(schema.wishLists).where(eq(schema.wishLists.id, listId));
    expect(list?.deletedAt).toEqual(clock);
    expect((await typesOf(top)).at(-1)).toEqual({ type: "deleted", visibility: "owner" });
  });

  it("deletes a list that was never archived, and archives it on the way", async () => {
    clock = new Date("2026-12-02T10:00:00Z");
    const listId = await newList("Directe");
    expect((await manage(owner, "DELETE", `/lists/${listId}`)).status).toBe(204);
    const [list] = await t.db.select().from(schema.wishLists).where(eq(schema.wishLists.id, listId));
    expect(list).toMatchObject({ archivedAt: clock, deletedAt: clock });
  });
});

describe("the REST API v1", () => {
  it("archives, restores and deletes with a token, never with a read-only one", async () => {
    const make = async (readOnly: boolean) =>
      (
        await manage(owner, "POST", "/api-tokens", {
          name: readOnly ? "Lecture" : "Script",
          readOnly,
          expiresInDays: 30,
        })
      ).body.token as string;
    const v1 = (token: string, method: NonNullable<InjectOptions["method"]>, url: string) =>
      send({ method, url: `/v1${url}`, headers: { host: API_HOST, authorization: `Bearer ${token}` } });
    const listId = await newList("Par script");
    const item = await newItem("Tournevis", listId);
    const reader = await make(true);
    const writer = await make(false);
    expect((await v1(reader, "DELETE", `/items/${item}`)).status).toBe(403);
    expect((await v1(writer, "DELETE", `/items/${item}`)).status).toBe(204);
    expect((await v1(writer, "DELETE", `/lists/${listId}`)).status).toBe(204);
    expect((await v1(reader, "GET", "/lists?archived=true")).status).toBe(200);
  });
});
