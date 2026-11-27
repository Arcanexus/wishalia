import { schema } from "@wishalia/db";
import { memoryStorage } from "@wishalia/storage";
import { eq } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../test/app.js";

const API_HOST = "api.wishalia.test";
const hex = "ab".repeat(32);
const storage = memoryStorage();
const clock = new Date("2026-12-01T10:00:00Z");
let t: TestApp;
let owner: string;
let cousin: string;
const FAMILY_EMAIL = "cousin@example.test";

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

async function newItem(input: string, listId: string, patch?: object) {
  const created = await manage(owner, "POST", "/items", { input, listId });
  expect(created.status).toBe(201);
  if (patch) expect((await manage(owner, "PATCH", `/items/${created.body.id}`, patch)).status).toBe(200);
  return created.body.id as string;
}

async function linkTo(body: object) {
  const link = await manage(owner, "POST", "/share-links", { audience: "Mamie", ...body });
  expect(link.status).toBe(201);
  return link.body.token as string;
}

const items = async (listId: string) =>
  (await manage(owner, "GET", `/lists/${listId}/items`)).body as {
    id: string;
    kind: string;
    title: string;
    parentId: string | null;
    position: number;
    listId: string;
    status: string;
  }[];

const typesOf = async (itemId: string) =>
  (await t.db.select().from(schema.itemEvents).where(eq(schema.itemEvents.wishId, itemId))).map(
    (entry) => entry.type,
  );

describe("series (docs/series.md)", () => {
  let listId: string;
  let volumes: string[];
  let lamp: string;
  let seriesId: string;

  beforeAll(async () => {
    listId = await newList("Livres");
    lamp = await newItem("Lampe", listId);
    // Made in another order than they are read: the series sorts them
    volumes = [];
    for (const n of [32, 30, 31]) {
      volumes.push(
        await newItem(`Dragon Ball Perfect Edition T${n} https://shop.example/t${n}`, listId, {
          priceCents: 1095,
        }),
      );
    }
  });

  it("groups wishes into a series named after what their titles share", async () => {
    const created = await manage(owner, "POST", `/lists/${listId}/series`, { itemIds: volumes });
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      kind: "series",
      title: "Dragon Ball Perfect Edition",
      parentId: null,
    });
    seriesId = created.body.id;
    const rows = await items(listId);
    const inside = rows.filter((row) => row.parentId === seriesId);
    expect(inside.map((row) => row.title)).toEqual([
      "Dragon Ball Perfect Edition T30",
      "Dragon Ball Perfect Edition T31",
      "Dragon Ball Perfect Edition T32",
    ]);
    expect(await typesOf(volumes[0] ?? "")).toContain("grouped");
    // One series and the lamp are the list's own wishes; the count says the three volumes and the lamp
    const lists = (await manage(owner, "GET", "/lists")).body as { id: string; itemCount: number }[];
    expect(lists.find((list) => list.id === listId)?.itemCount).toBe(4);
  });

  it("refuses a series in a series, a wish of another list, or one that is not found", async () => {
    const other = await newList("Autre");
    const elsewhere = await newItem("Vélo", other);
    expect((await manage(owner, "POST", `/lists/${listId}/series`, { itemIds: [seriesId] })).status).toBe(
      409,
    );
    expect((await manage(owner, "POST", `/lists/${listId}/series`, { itemIds: [elsewhere] })).status).toBe(
      404,
    );
    expect((await manage(owner, "POST", `/items/${seriesId}/volumes`, { itemIds: [elsewhere] })).status).toBe(
      409,
    );
    expect((await manage(owner, "POST", `/items/${lamp}/volumes`, { itemIds: [elsewhere] })).status).toBe(
      404,
    );
    expect((await manage(cousin, "POST", `/lists/${listId}/series`, { itemIds: [lamp] })).status).toBe(404);
  });

  it("adds a volume by the quick add, last, and keeps the series' own fields", async () => {
    const added = await manage(owner, "POST", "/items", {
      input: "Dragon Ball Perfect Edition T33",
      parentId: seriesId,
    });
    expect(added.status).toBe(201);
    expect(added.body.parentId).toBe(seriesId);
    expect(added.body.listId).toBe(listId);
    volumes.push(added.body.id);
    const inside = (await items(listId)).filter((row) => row.parentId === seriesId);
    expect(inside.at(-1)?.id).toBe(added.body.id);
    // A series has a name and notes only, and is received volume by volume
    expect((await manage(owner, "PATCH", `/items/${seriesId}`, { priceCents: 100 })).status).toBe(400);
    expect((await manage(owner, "PATCH", `/items/${seriesId}`, { status: "received" })).status).toBe(409);
    expect((await manage(owner, "PATCH", `/items/${seriesId}`, { notes: "Glénat" })).body.notes).toBe(
      "Glénat",
    );
    // Quick add into a wish that is no series: 404
    expect((await manage(owner, "POST", "/items", { input: "x", parentId: lamp })).status).toBe(404);
  });

  it("orders the volumes, and the list by its own wishes only", async () => {
    const reversed = [...volumes].reverse();
    expect(
      (await manage(owner, "PUT", `/items/${seriesId}/order`, { itemIds: reversed.slice(1) })).status,
    ).toBe(409);
    expect((await manage(owner, "PUT", `/items/${seriesId}/order`, { itemIds: reversed })).status).toBe(204);
    const inside = (await items(listId)).filter((row) => row.parentId === seriesId);
    expect(inside.map((row) => row.id)).toEqual(reversed);
    expect((await manage(owner, "PUT", `/lists/${listId}/order`, { itemIds: [lamp, seriesId] })).status).toBe(
      204,
    );
    // Volumes named in the list's order are left out: they keep their place in their series
    expect(
      (await manage(owner, "PUT", `/lists/${listId}/order`, { itemIds: [lamp, ...volumes] })).status,
    ).toBe(204);
    const after = await items(listId);
    expect(after.filter((row) => row.parentId === seriesId).map((row) => row.id)).toEqual(reversed);
    expect(after.filter((row) => !row.parentId && row.status === "open").map((row) => row.id)).toEqual([
      seriesId,
      lamp,
    ]);
  });

  it("shows the guests the series and each volume, given one by one", async () => {
    const token = await linkTo({ scope: "list", listId });
    const view = await guest(token, "GET", "/view");
    expect(view.status).toBe(200);
    const series = view.body.items.find((item: { id: string }) => item.id === seriesId);
    expect(series).toMatchObject({ kind: "series", parentId: null });
    const volume = view.body.items.find((item: { id: string }) => item.id === volumes[0]);
    expect(volume.parentId).toBe(seriesId);
    expect(
      (await guest(token, "POST", `/items/${seriesId}/contributions`, { payload: { guestName: "Paul" } }))
        .status,
    ).toBe(409);
    const given = await guest(token, "POST", `/items/${volumes[0]}/contributions`, {
      payload: { guestName: "Paul" },
    });
    expect(given.status).toBe(201);
    // The owner learns nothing from the series or its volumes
    const owned = await manage(owner, "GET", `/items/${volumes[0]}`);
    expect(JSON.stringify(owned.body)).not.toMatch(/Paul|contribution/);
  });

  it("brings the volumes to an event with their series, never one alone", async () => {
    const event = (
      await manage(owner, "POST", "/events", { name: "Noël", kind: "christmas", date: "2026-12-24" })
    ).body.id;
    expect((await manage(owner, "PUT", `/events/${event}/items/${volumes[1]}`)).status).toBe(409);
    expect((await manage(owner, "PUT", `/events/${event}/items/${seriesId}`)).status).toBe(204);
    const token = await linkTo({ scope: "event", eventId: event });
    const view = await guest(token, "GET", "/view");
    const ids = view.body.items.map((item: { id: string }) => item.id);
    expect(ids).toEqual(expect.arrayContaining([seriesId, ...volumes]));
    expect(ids).not.toContain(lamp);
    const given = await guest(token, "POST", `/items/${volumes[1]}/contributions`, {
      payload: { guestName: "Léa" },
    });
    expect(given.status).toBe(201);
    // On the list link, the volume is for the event of its series
    const listToken = await linkTo({ scope: "list", listId });
    const listView = await guest(listToken, "GET", "/view");
    const volume = listView.body.items.find((item: { id: string }) => item.id === volumes[2]);
    expect(volume.eventIds).toEqual([event]);
    expect(
      (
        await guest(listToken, "POST", `/items/${volumes[2]}/contributions`, {
          payload: { guestName: "Zoé", eventId: event },
        })
      ).status,
    ).toBe(201);
  });

  it("hides an archived series' volumes from the guests", async () => {
    const token = await linkTo({ scope: "list", listId });
    expect((await manage(owner, "PATCH", `/items/${seriesId}`, { status: "archived" })).status).toBe(200);
    const view = await guest(token, "GET", "/view");
    const ids = view.body.items.map((item: { id: string }) => item.id);
    expect(ids).not.toContain(seriesId);
    expect(ids).not.toContain(volumes[3]);
    expect(
      (await guest(token, "POST", `/items/${volumes[3]}/contributions`, { payload: { guestName: "Paul" } }))
        .status,
    ).toBe(404);
    expect((await manage(owner, "PATCH", `/items/${seriesId}`, { status: "open" })).status).toBe(200);
  });

  it("takes a volume out, into the series again, and moves a series with its volumes", async () => {
    const out = await manage(owner, "PATCH", `/items/${volumes[3]}`, { parentId: null });
    expect(out.body.parentId).toBeNull();
    expect(await typesOf(volumes[3] ?? "")).toContain("ungrouped");
    const back = await manage(owner, "PATCH", `/items/${volumes[3]}`, { parentId: seriesId });
    expect(back.body.parentId).toBe(seriesId);
    expect((await manage(owner, "PATCH", `/items/${seriesId}`, { parentId: seriesId })).status).toBe(400);
    expect((await manage(owner, "PATCH", `/items/${volumes[3]}`, { parentId: lamp })).status).toBe(404);

    const other = await newList("Mangas");
    expect((await manage(owner, "PATCH", `/items/${seriesId}`, { listId: other })).status).toBe(200);
    const moved = await items(other);
    expect(moved.filter((row) => row.parentId === seriesId)).toHaveLength(4);
    // A volume sent to another list leaves its series
    const left = await manage(owner, "PATCH", `/items/${volumes[3]}`, { listId });
    expect(left.body).toMatchObject({ listId, parentId: null });
    expect((await manage(owner, "PATCH", `/items/${seriesId}`, { listId })).status).toBe(200);
  });

  it("undoes a series: its volumes go back where it stood", async () => {
    const ungrouped = await manage(owner, "POST", `/items/${seriesId}/ungroup`);
    expect(ungrouped.status).toBe(204);
    const rows = await items(listId);
    expect(rows.find((row) => row.id === seriesId)).toBeUndefined();
    expect(rows.every((row) => row.parentId === null)).toBe(true);
    expect((await manage(owner, "POST", `/items/${lamp}/ungroup`)).status).toBe(404);
  });

  it("deletes a series with its volumes, and cancels what was given to them", async () => {
    const again = await manage(owner, "POST", `/lists/${listId}/series`, {
      itemIds: volumes.slice(0, 2),
      title: "Dragon Ball",
    });
    expect(again.body.title).toBe("Dragon Ball");
    expect((await manage(owner, "DELETE", `/items/${again.body.id}`)).status).toBe(204);
    const rows = await items(listId);
    expect(rows.map((row) => row.id)).not.toContain(volumes[0]);
    const given = await t.db
      .select()
      .from(schema.contributions)
      .where(eq(schema.contributions.wishId, volumes[0] ?? ""));
    expect(given.every((row) => row.status === "withdrawn")).toBe(true);
  });
});
