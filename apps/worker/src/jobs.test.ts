import { schema, type Database } from "@wishalia/db";
import { createTestDb } from "@wishalia/db/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

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
