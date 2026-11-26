import { schema } from "@wishalia/db";
import { memoryStorage } from "@wishalia/storage";
import { eq } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../../test/app.js";

const OTHER_EMAIL = "other-owner@example.test";
const API_HOST = "api.wishalia.test";
const hex = "ab".repeat(32);
const storage = memoryStorage();
let t: TestApp;
let off: TestApp;
let owner: string;
let other: string;

beforeAll(async () => {
  t = await createTestApp(
    { OWNER_EMAILS: `${OWNER_EMAIL},${OTHER_EMAIL}`, API_ORIGIN: `https://${API_HOST}` },
    undefined,
    { storage, imgproxy: { key: hex, salt: hex, source: "s3://wishalia/" } },
  );
  owner = await signIn(t, OWNER_EMAIL);
  other = await signIn(t, OTHER_EMAIL);
  off = await createTestApp();
}, 30_000);

afterAll(async () => {
  await t.close();
  await off.close();
});

interface Answer {
  status: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON answers, read field by field
  body: any;
}

async function send(app: TestApp, options: InjectOptions): Promise<Answer> {
  const response = await app.app.inject(options);
  return { status: response.statusCode, body: response.body ? response.json() : null };
}

const as = (
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: unknown,
  type?: string,
) =>
  send(t, {
    method,
    url: `/manage${url}`,
    headers: { cookie, ...(type ? { "content-type": type } : {}) },
    ...(payload !== undefined ? { payload: payload as never } : {}),
  });

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(64);
  Buffer.from("\x89PNG\r\n\x1a\n", "latin1").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function newList(name = "Noël de Léa", cookie = owner) {
  const created = await as(cookie, "POST", "/lists", { name });
  expect(created.status).toBe(201);
  return created.body.id as string;
}

const upload = (listId: string, body: Buffer, type = "image/png", cookie = owner) =>
  as(cookie, "PUT", `/lists/${listId}/image`, body, type);

const keyOf = async (listId: string) =>
  (
    await t.db
      .select({ key: schema.wishLists.imageKey })
      .from(schema.wishLists)
      .where(eq(schema.wishLists.id, listId))
  )[0]?.key ?? null;

describe("the icon of a list", () => {
  it("starts with none (the default one) and takes one of the icons", async () => {
    const listId = await newList();
    const created = (await as(owner, "GET", "/lists")).body.find(
      (list: { id: string }) => list.id === listId,
    );
    expect(created).toMatchObject({ icon: null, image: null });
    const changed = await as(owner, "PATCH", `/lists/${listId}`, { icon: "tree" });
    expect(changed).toMatchObject({ status: 200, body: { icon: "tree", image: null } });
    const back = await as(owner, "PATCH", `/lists/${listId}`, { icon: null });
    expect(back.body.icon).toBeNull();
  });

  it("refuses an icon Wishalia does not draw", async () => {
    const listId = await newList();
    for (const icon of ["rocket", "../tree", "", 3]) {
      expect((await as(owner, "PATCH", `/lists/${listId}`, { icon })).status).toBe(400);
    }
  });

  it("leaves the icon alone when the rest of the list changes", async () => {
    const listId = await newList();
    await as(owner, "PATCH", `/lists/${listId}`, { icon: "cake" });
    const renamed = await as(owner, "PATCH", `/lists/${listId}`, { name: "Anniversaire" });
    expect(renamed.body).toMatchObject({ name: "Anniversaire", icon: "cake" });
  });

  it("works without images on the server", async () => {
    const cookie = await signIn(off, OWNER_EMAIL);
    const created = await send(off, {
      method: "POST",
      url: "/manage/lists",
      headers: { cookie },
      payload: { name: "Sans images" },
    });
    const changed = await send(off, {
      method: "PATCH",
      url: `/manage/lists/${created.body.id}`,
      headers: { cookie },
      payload: { icon: "star" },
    });
    expect(changed.body).toMatchObject({ icon: "star", image: null });
    const sent = await send(off, {
      method: "PUT",
      url: `/manage/lists/${created.body.id}/image`,
      headers: { cookie, "content-type": "image/png" },
      payload: png(400, 400),
    });
    expect(sent).toMatchObject({ status: 503, body: { error: "images_off" } });
  });
});

describe("the image of a list", () => {
  it("stores the owner's image under the list and shows it in place of the icon", async () => {
    const listId = await newList();
    await as(owner, "PATCH", `/lists/${listId}`, { icon: "tree" });
    const sent = await upload(listId, png(800, 600));
    expect(sent.status).toBe(200);
    expect(sent.body.image.small).toMatch(/^\/img\/[\w-]{43}\/rs:fill:192:192:0\/[\w-]+\.webp$/);
    expect(sent.body.image.medium).toContain("rs:fill:480:480:0");
    // The icon stays chosen, for when the image goes
    expect(sent.body.icon).toBe("tree");
    const key = await keyOf(listId);
    expect(key).toMatch(new RegExp(`^lists/${listId}/[0-9a-f-]{36}$`));
    expect(storage.objects.get(key ?? "")?.contentType).toBe("image/png");
    const listed = (await as(owner, "GET", "/lists")).body.find((list: { id: string }) => list.id === listId);
    expect(listed.image).toEqual(sent.body.image);
  });

  it("replaces the previous image, whose file goes", async () => {
    const listId = await newList();
    await upload(listId, png(400, 400));
    const first = await keyOf(listId);
    await upload(listId, png(500, 500));
    const second = await keyOf(listId);
    expect(second).not.toBe(first);
    expect(storage.objects.has(first ?? "")).toBe(false);
    expect(storage.objects.has(second ?? "")).toBe(true);
  });

  it("refuses what is not an image, an SVG or a decompression bomb, and keeps no file", async () => {
    const listId = await newList();
    const before = storage.objects.size;
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(listId, svg, "image/svg+xml")).status).toBe(415);
    expect((await upload(listId, Buffer.from("not an image"), "image/png")).status).toBe(415);
    expect((await upload(listId, png(10_000, 10_000))).status).toBe(422);
    expect((await upload(listId, Buffer.alloc(0), "application/octet-stream")).status).toBe(415);
    expect((await as(owner, "PUT", `/lists/${listId}/image`, { a: 1 })).status).toBe(415);
    expect(storage.objects.size).toBe(before);
    expect(await keyOf(listId)).toBeNull();
  });

  it("refuses over 10 MB", async () => {
    const listId = await newList();
    const big = Buffer.concat([png(400, 400), Buffer.alloc(10 * 1024 * 1024)]);
    expect((await upload(listId, big)).status).toBe(413);
  });

  it("is the owner's only", async () => {
    const listId = await newList();
    expect((await upload(listId, png(400, 400), "image/png", other)).status).toBe(404);
    expect((await as(other, "DELETE", `/lists/${listId}/image`)).status).toBe(404);
    expect((await as(other, "PATCH", `/lists/${listId}`, { icon: "star" })).status).toBe(404);
    expect((await upload("00000000-0000-4000-8000-000000000000", png(400, 400))).status).toBe(404);
    expect((await upload("not-a-uuid", png(400, 400))).status).toBe(400);
  });

  it("goes when removed, file included, and the icon shows again", async () => {
    const listId = await newList();
    await as(owner, "PATCH", `/lists/${listId}`, { icon: "heart" });
    await upload(listId, png(400, 400));
    const key = await keyOf(listId);
    const removed = await as(owner, "DELETE", `/lists/${listId}/image`);
    expect(removed).toMatchObject({ status: 200, body: { icon: "heart", image: null } });
    expect(storage.objects.has(key ?? "")).toBe(false);
    expect(await as(owner, "DELETE", `/lists/${listId}/image`)).toMatchObject({
      status: 404,
      body: { error: "no_image" },
    });
  });

  it("gives way to an icon chosen afterwards", async () => {
    const listId = await newList();
    await upload(listId, png(400, 400));
    const key = await keyOf(listId);
    const changed = await as(owner, "PATCH", `/lists/${listId}`, { icon: "book" });
    expect(changed.body).toMatchObject({ icon: "book", image: null });
    expect(storage.objects.has(key ?? "")).toBe(false);
  });

  it("goes with the list when it is deleted", async () => {
    const listId = await newList();
    await upload(listId, png(400, 400));
    const key = await keyOf(listId);
    expect((await as(owner, "DELETE", `/lists/${listId}`)).status).toBe(204);
    expect(storage.objects.has(key ?? "")).toBe(false);
    expect(await keyOf(listId)).toBeNull();
  });

  it("keeps the open link of a public list in its answers", async () => {
    const listId = await newList();
    await as(owner, "PATCH", `/lists/${listId}`, { visibility: "public" });
    const sent = await upload(listId, png(400, 400));
    expect(sent.body.openUrl).toMatch(/^https:\/\/wishalia\.test\/s\//);
    const removed = await as(owner, "DELETE", `/lists/${listId}/image`);
    expect(removed.body.openUrl).toBe(sent.body.openUrl);
  });
});

describe("the picture of a list on the guests' side", () => {
  it("shows on the share link's page and in the home page's search, signed only", async () => {
    const listId = await newList("Envies de Mamie");
    await as(owner, "PATCH", `/lists/${listId}`, { icon: "paw" });
    const link = await as(owner, "POST", "/share-links", { scope: "list", listId, audience: "Mamie" });
    expect(link.status).toBe(201);
    const token = link.body.url.split("/s/")[1];
    const view = async () =>
      (await send(t, { method: "GET", url: "/public/view", headers: { "x-share-token": token } })).body;
    expect((await view()).list).toMatchObject({ icon: "paw", image: null });

    await upload(listId, png(400, 400));
    const shown = (await view()).list;
    expect(shown.image.small).toMatch(/^\/img\//);
    expect(JSON.stringify(shown)).not.toContain(`lists/${listId}`);

    await as(owner, "PATCH", `/lists/${listId}`, { visibility: "public" });
    const found = (await send(t, { method: "GET", url: "/public/home?q=Mamie" })).body.lists;
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ name: "Envies de Mamie", icon: "paw" });
    expect(found[0].image.small).toBe(shown.image.small);
  });
});

describe("the picture of a list in the REST API v1", () => {
  it("is chosen and sent with a token, and described", async () => {
    const created = await as(owner, "POST", "/api-tokens", { name: "Script" });
    const secret = created.body.token as string;
    const listId = await newList();
    const v1 = (
      method: NonNullable<InjectOptions["method"]>,
      url: string,
      payload?: unknown,
      type?: string,
    ) =>
      send(t, {
        method,
        url: `/v1${url}`,
        headers: {
          host: API_HOST,
          authorization: `Bearer ${secret}`,
          ...(type ? { "content-type": type } : {}),
        },
        ...(payload !== undefined ? { payload: payload as never } : {}),
      });
    expect((await v1("PATCH", `/lists/${listId}`, { icon: "music" })).body.icon).toBe("music");
    expect((await v1("PUT", `/lists/${listId}/image`, png(400, 400), "image/png")).body.image).not.toBeNull();
    expect((await v1("DELETE", `/lists/${listId}/image`)).body.image).toBeNull();
    const document = (await send(t, { method: "GET", url: "/v1/openapi.json", headers: { host: API_HOST } }))
      .body;
    expect(Object.keys(document.paths)).toContain("/lists/{listId}/image");
    expect(document.components.schemas.List.properties.icon.enum).toContain("tree");
  });
});
