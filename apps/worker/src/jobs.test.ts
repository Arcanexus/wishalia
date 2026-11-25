import { schema, type Database } from "@wishalia/db";
import { createTestDb } from "@wishalia/db/testing";
import { eq, type SQL } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { memoryStorage } from "@wishalia/storage";

import { FetchError } from "./fetch.js";
import { claim, enrichNext, RETRY_DELAY_MS, RUN_TIMEOUT_MS } from "./jobs.js";

/** The one row a query gives, or the test fails. */
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error("no row");
  return row;
}

let db: Database;
let close: () => Promise<void>;
let listId: string;

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const user = one(
    await db.insert(schema.users).values({ displayName: "Léa", email: "lea@example.test" }).returning(),
  );
  const list = one(
    await db.insert(schema.wishLists).values({ ownerId: user.id, name: "Mes envies" }).returning(),
  );
  listId = list.id;
});
afterAll(() => close());

const at = (iso: string) => new Date(iso);
let clock = at("2026-11-24T10:00:00Z");
const now = () => clock;

async function wish(values: Partial<typeof schema.wishes.$inferInsert> = {}) {
  const rows = await db
    .insert(schema.wishes)
    .values({
      listId,
      title: "example.com",
      url: "https://www.example.com/lampe",
      enrichment: "pending",
      ...values,
    })
    .returning();
  return one(rows);
}
const read = async (id: string) => one(await db.select().from(schema.wishes).where(eq(schema.wishes.id, id)));
const page = (html: string) => async (url: string) => ({ url, html });
const product = `<script type="application/ld+json">{"@type":"Product","name":"Lampe en laiton","offers":{"price":"49.90","priceCurrency":"EUR"}}</script>`;

describe("the enrichment queue", () => {
  it("completes the placeholder title and the empty price, and writes it in the history", async () => {
    const item = await wish();
    expect(await enrichNext({ db, fetchPage: page(product), now })).toBe("done");
    expect(await read(item.id)).toMatchObject({
      title: "Lampe en laiton",
      priceCents: 4990,
      enrichment: "done",
      enrichmentAttempts: 1,
    });
    const history = await db.select().from(schema.itemEvents).where(eq(schema.itemEvents.wishId, item.id));
    expect(history).toMatchObject([
      {
        type: "enriched",
        visibility: "owner",
        actorId: null,
        payload: { title: "Lampe en laiton", priceCents: 4990 },
      },
    ]);
    expect(await enrichNext({ db, fetchPage: page(product), now })).toBe("idle");
  });

  it("keeps what the owner wrote, even when they change it while the page loads", async () => {
    const item = await wish();
    const result = await enrichNext({
      db,
      now,
      fetchPage: async (url) => {
        await db.update(schema.wishes).set({ title: "La lampe de Léa" }).where(eq(schema.wishes.id, item.id));
        return page(product)(url);
      },
    });
    expect(result).toBe("done");
    expect(await read(item.id)).toMatchObject({ title: "La lampe de Léa", priceCents: 4990 });
  });

  it("drops a result when the link changed meanwhile: the new link is queued again", async () => {
    const item = await wish();
    const result = await enrichNext({
      db,
      now,
      fetchPage: async (url) => {
        await db
          .update(schema.wishes)
          .set({ url: "https://www.example.com/autre", enrichment: "pending" })
          .where(eq(schema.wishes.id, item.id));
        return page(product)(url);
      },
    });
    expect(result).toBe("skipped");
    expect(await read(item.id)).toMatchObject({ title: "example.com", enrichment: "pending" });
    await db.update(schema.wishes).set({ enrichment: null }).where(eq(schema.wishes.id, item.id));
  });

  it("says unchanged when the page has nothing new", async () => {
    const item = await wish({ title: "Mes mots", priceCents: 1000 });
    expect(await enrichNext({ db, fetchPage: page(product), now })).toBe("unchanged");
    expect(await read(item.id)).toMatchObject({ title: "Mes mots", priceCents: 1000, enrichment: "done" });
  });

  it("tries again later, a bit later each time, then gives up", async () => {
    const item = await wish();
    const down = async () => {
      throw new FetchError("timeout");
    };
    expect(await enrichNext({ db, fetchPage: down, now })).toBe("retry");
    expect(await read(item.id)).toMatchObject({ enrichment: "pending", enrichmentAttempts: 1 });
    // Not before its delay
    expect(await enrichNext({ db, fetchPage: down, now })).toBe("idle");
    clock = new Date(clock.getTime() + RETRY_DELAY_MS + 1);
    expect(await enrichNext({ db, fetchPage: down, now })).toBe("retry");
    clock = new Date(clock.getTime() + 2 * RETRY_DELAY_MS + 1);
    expect(await enrichNext({ db, fetchPage: down, now })).toBe("failed");
    expect(await read(item.id)).toMatchObject({ enrichment: "failed", enrichmentAttempts: 3 });
  });

  it("gives up at once on a refused address", async () => {
    const item = await wish({ url: "http://192.168.1.1/" });
    const refused = async () => {
      throw new FetchError("blocked_address");
    };
    expect(await enrichNext({ db, fetchPage: refused, now })).toBe("failed");
    expect((await read(item.id)).enrichment).toBe("failed");
  });

  it("takes a wall against robots for a page not read yet, never for a result", async () => {
    const item = await wish({ url: "https://www.amazon.fr/dp/B0BSHF7WHW" });
    const wall = page(`<title>Amazon.fr</title><form action="/errors/validateCaptcha"></form>`);
    expect(await enrichNext({ db, fetchPage: wall, now })).toBe("retry");
    expect(await read(item.id)).toMatchObject({
      priceCents: null,
      enrichment: "pending",
      enrichmentAttempts: 1,
    });
    await db.update(schema.wishes).set({ enrichment: null }).where(eq(schema.wishes.id, item.id));
  });

  it("sends no Date to the driver: the postgres driver refuses them in raw SQL", async () => {
    const params: unknown[] = [];
    const spy = {
      execute: async (query: SQL) => {
        params.push(...new PgDialect().sqlToQuery(query).params);
        return [];
      },
    } as unknown as Database;
    expect(await claim(spy, clock)).toBeNull();
    expect(params.length).toBeGreaterThan(0);
    expect(params.filter((param) => param instanceof Date)).toEqual([]);
  });

  it("takes back a run whose worker stopped, and clears an item without a link", async () => {
    const stuck = await wish({ enrichment: "running", enrichmentAt: clock, enrichmentAttempts: 1 });
    expect(await claim(db, clock)).toBeNull();
    clock = new Date(clock.getTime() + RUN_TIMEOUT_MS + 1);
    expect(await claim(db, clock)).toMatchObject({ id: stuck.id, attempts: 2 });
    await db.update(schema.wishes).set({ enrichment: "done" }).where(eq(schema.wishes.id, stuck.id));

    const bare = await wish({ url: null });
    expect(await enrichNext({ db, fetchPage: page(product), now })).toBe("skipped");
    expect((await read(bare.id)).enrichment).toBeNull();
  });
});

/** A PNG header of the given size: enough for the sniffing, which reads the first bytes only. */
function png(width: number, height: number): Buffer {
  const header = Buffer.alloc(33);
  Buffer.from("\x89PNG\r\n\x1a\n", "latin1").copy(header, 0);
  header.writeUInt32BE(13, 8);
  header.write("IHDR", 12, "latin1");
  header.writeUInt32BE(width, 16);
  header.writeUInt32BE(height, 20);
  return header;
}

describe("the images of the page", () => {
  const gallery = `<script type="application/ld+json">{"@type":"Product","name":"Lampe en laiton",
    "image":["/a.png","/tiny.png","/svg.png","/down.png","/b.png","/c.png","/d.png","/e.png"]}</script>`;
  const files: Record<string, Buffer> = {
    "/a.png": png(800, 800),
    "/tiny.png": png(1, 1),
    "/svg.png": Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"),
    "/b.png": png(600, 400),
    "/c.png": png(500, 500),
    "/d.png": png(900, 700),
    "/e.png": png(900, 700),
  };
  const fetchImage = async (link: string) => {
    const bytes = files[new URL(link).pathname];
    if (!bytes) throw new FetchError("http_404");
    return { url: link, bytes, contentType: "image/png" };
  };
  const images = async (wishId: string) =>
    db
      .select()
      .from(schema.wishImages)
      .where(eq(schema.wishImages.wishId, wishId))
      .orderBy(schema.wishImages.position);

  it("keeps four real, large enough images in the bucket, and shows the first", async () => {
    const storage = memoryStorage();
    const item = await wish();
    expect(await enrichNext({ db, fetchPage: page(gallery), storage, fetchImage, now })).toBe("done");
    const kept = await images(item.id);
    expect(kept).toHaveLength(4);
    expect(kept.map((image) => [image.width, image.height, image.source])).toEqual([
      [800, 800, "page"],
      [600, 400, "page"],
      [500, 500, "page"],
      [900, 700, "page"],
    ]);
    expect([...storage.objects.keys()].sort()).toEqual(kept.map((image) => image.key).sort());
    expect(kept[0]?.key).toMatch(new RegExp(`^wishes/${item.id}/[\\da-f-]{36}$`));
    expect(await read(item.id)).toMatchObject({ imageId: kept[0]?.id, imageCrop: null });
    const history = await db.select().from(schema.itemEvents).where(eq(schema.itemEvents.wishId, item.id));
    expect(history.map((entry) => entry.type)).toEqual(["enriched", "image_changed"]);
    expect(history[1]).toMatchObject({
      actorId: null,
      visibility: "owner",
      payload: { source: "page", proposals: 4 },
    });
  });

  it("replaces the page's older proposals, but keeps the owner's own image shown", async () => {
    const storage = memoryStorage();
    const item = await wish({ title: "Mes mots", priceCents: 100 });
    await enrichNext({ db, fetchPage: page(gallery), storage, fetchImage, now });
    const first = await images(item.id);
    const upload = one(
      await db
        .insert(schema.wishImages)
        .values({
          wishId: item.id,
          source: "upload",
          key: `wishes/${item.id}/mine`,
          contentType: "image/png",
          bytes: 10,
        })
        .returning(),
    );
    await db
      .update(schema.wishes)
      .set({
        imageId: upload.id,
        imageCrop: { x: 0, y: 0, width: 0.5, height: 0.5 },
        enrichment: "pending",
        enrichmentAttempts: 0,
        enrichmentAt: null,
      })
      .where(eq(schema.wishes.id, item.id));

    expect(await enrichNext({ db, fetchPage: page(gallery), storage, fetchImage, now })).toBe("done");
    const second = await images(item.id);
    expect(second).toHaveLength(5);
    expect(second.some((image) => first.some((old) => old.id === image.id && image.source === "page"))).toBe(
      false,
    );
    for (const old of first) expect(storage.objects.has(old.key)).toBe(false);
    expect(await read(item.id)).toMatchObject({ imageId: upload.id, imageCrop: { width: 0.5 } });
  });

  it("removes the files of a result that came too late, and works without images", async () => {
    const storage = memoryStorage();
    const item = await wish();
    const result = await enrichNext({
      db,
      now,
      storage,
      fetchImage,
      fetchPage: async (url) => {
        await db
          .update(schema.wishes)
          .set({ url: "https://www.example.com/autre" })
          .where(eq(schema.wishes.id, item.id));
        return page(gallery)(url);
      },
    });
    expect(result).toBe("skipped");
    expect(storage.objects.size).toBe(0);
    await db.update(schema.wishes).set({ enrichment: null }).where(eq(schema.wishes.id, item.id));

    const plain = await wish({ title: "Mes mots", priceCents: 100 });
    expect(await enrichNext({ db, fetchPage: page(gallery), now })).toBe("unchanged");
    expect(await images(plain.id)).toEqual([]);
  });
});
