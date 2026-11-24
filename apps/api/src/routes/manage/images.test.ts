import { schema } from "@wishalia/db";
import { memoryStorage } from "@wishalia/storage";
import { eq } from "drizzle-orm";
import type { InjectOptions } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../../test/app.js";

const OTHER_EMAIL = "other-owner@example.test";
const hex = "ab".repeat(32);
const storage = memoryStorage();
let t: TestApp;
let off: TestApp;
let owner: string;
let other: string;

beforeAll(async () => {
  t = await createTestApp({ OWNER_EMAILS: `${OWNER_EMAIL},${OTHER_EMAIL}` }, undefined, {
    storage,
    imgproxy: { key: hex, salt: hex, source: "s3://wishalia/" },
  });
  owner = await signIn(t, OWNER_EMAIL);
  other = await signIn(t, OTHER_EMAIL);
  off = await createTestApp();
}, 30_000);

afterAll(async () => {
  await t.close();
  await off.close();
});

async function as(
  cookie: string,
  method: NonNullable<InjectOptions["method"]>,
  url: string,
  payload?: unknown,
  type?: string,
) {
  const options: InjectOptions = {
    method,
    url,
    headers: { cookie, ...(type ? { "content-type": type } : {}) },
  };
  if (payload !== undefined) options.payload = payload as never;
  const response = await t.app.inject(options);
  return { status: response.statusCode, body: response.body ? response.json() : null };
}

function png(width: number, height: number): Buffer {
  const bytes = Buffer.alloc(64);
  Buffer.from("\x89PNG\r\n\x1a\n", "latin1").copy(bytes, 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12, "latin1");
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

async function newItem(cookie = owner) {
  const created = await as(cookie, "POST", "/manage/items", { input: "Une lampe" });
  expect(created.status).toBe(201);
  return created.body.id as string;
}

const upload = (itemId: string, body: Buffer, type = "image/png", cookie = owner) =>
  as(cookie, "PUT", `/manage/items/${itemId}/image`, body, type);

describe("the images of an item", () => {
  it("says whether images are on", async () => {
    expect((await as(owner, "GET", "/manage/me")).body.features).toEqual({ images: true });
    const offOwner = await signIn(off, OWNER_EMAIL);
    const me = await off.app.inject({ method: "GET", url: "/manage/me", headers: { cookie: offOwner } });
    expect(me.json().features).toEqual({ images: false });
    const id = (
      await off.app.inject({
        method: "POST",
        url: "/manage/items",
        headers: { cookie: offOwner },
        payload: { input: "x" },
      })
    ).json().id;
    const refused = await off.app.inject({
      method: "PUT",
      url: `/manage/items/${id}/image`,
      headers: { cookie: offOwner, "content-type": "image/png" },
      payload: png(10, 10),
    });
    expect(refused.statusCode).toBe(503);
    const listed = await off.app.inject({
      method: "GET",
      url: `/manage/items/${id}/images`,
      headers: { cookie: offOwner },
    });
    expect(listed.json()).toEqual({ imageId: null, crop: null, images: [] });
  });

  it("keeps an image the owner sends, read from its bytes, and gives signed thumbnails", async () => {
    const itemId = await newItem();
    // The browser may say anything: the bytes decide
    const sent = await upload(itemId, png(800, 600), "application/octet-stream");
    expect(sent.status).toBe(200);
    expect(sent.body.image.small).toMatch(/^\/img\/[\w-]{43}\/rs:fill:192:192:0\/[\w-]+\.webp$/);
    expect(sent.body.imageCrop).toBeNull();
    const [stored] = await t.db.select().from(schema.wishImages).where(eq(schema.wishImages.wishId, itemId));
    expect(stored).toMatchObject({ source: "upload", contentType: "image/png", width: 800, height: 600 });
    expect(storage.objects.get(stored?.key ?? "")?.contentType).toBe("image/png");
    expect(sent.body.image.small).not.toContain(stored?.key);

    // A second one replaces the first, file included
    const again = await upload(itemId, png(400, 400));
    expect(again.status).toBe(200);
    expect(storage.objects.has(stored?.key ?? "")).toBe(false);
    const listed = await as(owner, "GET", `/manage/items/${itemId}/images`);
    expect(listed.body.images).toHaveLength(1);
    expect(listed.body.images[0]).toMatchObject({ source: "upload", width: 400 });
    expect(listed.body.imageId).toBe(listed.body.images[0].id);

    const history = (await as(owner, "GET", `/manage/items/${itemId}/history`)).body;
    expect(history.filter((entry: { type: string }) => entry.type === "image_changed")).toHaveLength(2);
    // The list shows it too
    const items = (await as(owner, "GET", `/manage/lists/${sent.body.listId}/items`)).body;
    expect(items.find((item: { id: string }) => item.id === itemId).image.medium).toContain(
      "rs:fill:480:480:0",
    );
  });

  it("refuses what is not an image, SVG included, too many pixels, too big, or someone else's item", async () => {
    const itemId = await newItem();
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect((await upload(itemId, svg, "image/svg+xml")).status).toBe(415);
    expect((await upload(itemId, Buffer.from("not an image at all"))).status).toBe(415);
    expect((await upload(itemId, png(20_000, 20_000))).status).toBe(422);
    expect((await upload(itemId, Buffer.alloc(11 * 1024 * 1024))).status).toBe(413);
    expect((await as(owner, "PUT", `/manage/items/${itemId}/image`, "{}", "application/json")).status).toBe(
      415,
    );
    expect((await upload(itemId, png(800, 600), "image/png", other)).status).toBe(404);
    expect((await as(other, "GET", `/manage/items/${itemId}/images`)).status).toBe(404);
  });

  it("chooses a proposal of the page, frames it, and shows none", async () => {
    const itemId = await newItem();
    const proposals = await t.db
      .insert(schema.wishImages)
      .values(
        [0, 1].map((position) => ({
          wishId: itemId,
          source: "page" as const,
          key: `wishes/${itemId}/page-${position}`,
          contentType: "image/jpeg",
          bytes: 1000,
          width: 600,
          height: 600,
          position,
        })),
      )
      .returning();
    const [one, two] = proposals;

    const chosen = await as(owner, "PATCH", `/manage/items/${itemId}/image`, { imageId: one?.id });
    expect(chosen.status).toBe(200);
    expect(chosen.body.image.small).toBeTruthy();

    const framed = await as(owner, "PATCH", `/manage/items/${itemId}/image`, {
      crop: { x: 0.9, y: 0, width: 0.5, height: 0.5 },
    });
    expect(framed.body.imageCrop).toEqual({ x: 0.5, y: 0, width: 0.5, height: 0.5 });
    expect(framed.body.image.small).toContain("/c:0.5:0.5:nowe:0.5:0/");
    expect(framed.body.image.large).not.toContain("/c:");

    // Nothing new: no history entry
    const before = (await as(owner, "GET", `/manage/items/${itemId}/history`)).body.length;
    await as(owner, "PATCH", `/manage/items/${itemId}/image`, {
      crop: { x: 0.5, y: 0, width: 0.5, height: 0.5 },
    });
    expect((await as(owner, "GET", `/manage/items/${itemId}/history`)).body.length).toBe(before);

    // Another image starts whole
    const switched = await as(owner, "PATCH", `/manage/items/${itemId}/image`, { imageId: two?.id });
    expect(switched.body.imageCrop).toBeNull();
    const none = await as(owner, "PATCH", `/manage/items/${itemId}/image`, { imageId: null });
    expect(none.body).toMatchObject({ image: null, imageCrop: null });
    const history = (await as(owner, "GET", `/manage/items/${itemId}/history`)).body;
    expect(history.at(-1)).toMatchObject({
      type: "image_changed",
      payload: { changes: { imageId: { from: two?.id, to: null } } },
    });
  });

  it("refuses an image of another item, a frame without an image, and an empty change", async () => {
    const itemId = await newItem();
    const elsewhere = await newItem();
    const [foreign] = await t.db
      .insert(schema.wishImages)
      .values({
        wishId: elsewhere,
        source: "page",
        key: `wishes/${elsewhere}/x`,
        contentType: "image/png",
        bytes: 1,
      })
      .returning();
    expect((await as(owner, "PATCH", `/manage/items/${itemId}/image`, { imageId: foreign?.id })).status).toBe(
      400,
    );
    expect(
      (
        await as(owner, "PATCH", `/manage/items/${itemId}/image`, {
          crop: { x: 0, y: 0, width: 0.5, height: 0.5 },
        })
      ).status,
    ).toBe(409);
    expect((await as(owner, "PATCH", `/manage/items/${itemId}/image`, {})).status).toBe(400);
    expect((await as(owner, "PATCH", `/manage/items/${itemId}/image`, { crop: { x: "a" } })).status).toBe(
      400,
    );
  });

  it("gives the guests the signed thumbnails, never where the file is", async () => {
    const itemId = await newItem();
    await upload(itemId, png(800, 600));
    const item = (await as(owner, "GET", `/manage/items/${itemId}`)).body;
    const link = await as(owner, "POST", "/manage/share-links", {
      scope: "list",
      listId: item.listId,
      audience: "Mamie",
    });
    expect(link.status).toBe(201);
    const view = await t.app.inject({
      method: "GET",
      url: "/public/view",
      headers: { "x-share-token": link.body.token },
    });
    const seen = view.json().items.find((entry: { id: string }) => entry.id === itemId);
    expect(seen.image).toEqual(item.image);
    expect(JSON.stringify(view.json())).not.toContain("wishes/");
  });
});
