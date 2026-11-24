import { PGlite } from "@electric-sql/pglite";
import { eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { migrationsFolder } from "./migrate.js";
import * as schema from "./schema.js";
import { seedDemo } from "./seed.js";

// The real migrations, applied to an in-memory PostgreSQL (PGlite): no server needed in CI
const client = new PGlite();
const db = drizzle(client, { schema });

beforeAll(async () => {
  await migrate(db, { migrationsFolder });
}, 30_000);

afterAll(async () => {
  await client.close();
});

/** The first row of a query, which the test needs to exist. */
function first<T>(rows: T[]): T {
  const [row] = rows;
  if (row === undefined) {
    throw new Error("expected at least one row");
  }
  return row;
}

/** The PostgreSQL error behind a failed Drizzle query (Drizzle wraps it in `cause`). */
async function pgError(query: Promise<unknown>): Promise<string> {
  try {
    await query;
  } catch (error) {
    const cause = (error as { cause?: { message?: string } }).cause;
    return cause?.message ?? (error as Error).message;
  }
  throw new Error("the query succeeded");
}

describe("migrations", () => {
  it("create the tables of the spec, the four of the sign-in, the API tokens and the images", async () => {
    const result = await client.query<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name",
    );
    expect(result.rows.map((row) => row.table_name)).toEqual([
      "api_tokens",
      "auth_accounts",
      "auth_passkeys",
      "auth_sessions",
      "auth_verifications",
      "contributions",
      "event_wishes",
      "events",
      "item_events",
      "series",
      "share_links",
      "users",
      "wish_images",
      "wish_lists",
      "wishes",
    ]);
  });
});

describe("demo seed", () => {
  it("creates a consistent data set", async () => {
    const { christmasId } = await seedDemo(db);
    const contributions = await db
      .select()
      .from(schema.contributions)
      .where(eq(schema.contributions.eventId, christmasId));
    expect(contributions).toHaveLength(3);
    const selected = await db
      .select()
      .from(schema.eventWishes)
      .where(eq(schema.eventWishes.eventId, christmasId));
    expect(selected).toHaveLength(4);
  });
});

describe("item_events is append-only", () => {
  it("accepts inserts", async () => {
    const wish = first(await db.select({ id: schema.wishes.id }).from(schema.wishes).limit(1));
    await expect(
      db.insert(schema.itemEvents).values({ wishId: wish.id, type: "updated", visibility: "owner" }),
    ).resolves.toBeDefined();
  });

  it("rejects updates", async () => {
    expect(await pgError(db.update(schema.itemEvents).set({ visibility: "owner" }))).toMatch(
      /append-only: UPDATE/,
    );
  });

  it("rejects deletes", async () => {
    expect(await pgError(db.delete(schema.itemEvents))).toMatch(/append-only: DELETE/);
  });

  it("rejects truncate", async () => {
    expect(await pgError(db.execute(sql`TRUNCATE item_events`))).toMatch(/append-only: TRUNCATE/);
  });
});

describe("constraints", () => {
  async function aList(): Promise<string> {
    return first(await db.select({ id: schema.wishLists.id }).from(schema.wishLists).limit(1)).id;
  }

  it("requires a positive quantity on a quantity item", async () => {
    const listId = await aList();
    expect(await pgError(db.insert(schema.wishes).values({ listId, kind: "quantity", title: "x" }))).toMatch(
      /wishes_quantity/,
    );
  });

  it("refuses a zero pool target", async () => {
    const listId = await aList();
    expect(
      await pgError(db.insert(schema.wishes).values({ listId, kind: "pool", title: "x", targetCents: 0 })),
    ).toMatch(/wishes_pool_target/);
  });

  it("needs a series number with a series", async () => {
    const listId = await aList();
    const saga = first(await db.select({ id: schema.series.id }).from(schema.series).limit(1));
    expect(await pgError(db.insert(schema.wishes).values({ listId, title: "x", seriesId: saga.id }))).toMatch(
      /wishes_series/,
    );
  });

  it("needs someone and something in a contribution", async () => {
    const contribution = first(await db.select().from(schema.contributions).limit(1));
    const base = { wishId: contribution.wishId, eventId: contribution.eventId };
    expect(await pgError(db.insert(schema.contributions).values({ ...base, amountCents: 100 }))).toMatch(
      /contributions_who/,
    );
    expect(await pgError(db.insert(schema.contributions).values({ ...base, guestName: "Léo" }))).toMatch(
      /contributions_what/,
    );
  });

  it("ties a share link to exactly one list or one event", async () => {
    const owner = first(await db.select({ id: schema.users.id }).from(schema.users).limit(1));
    const listId = await aList();
    expect(
      await pgError(
        db
          .insert(schema.shareLinks)
          .values({ ownerId: owner.id, tokenHash: "h1", scope: "event", listId, audience: "Mamie" }),
      ),
    ).toMatch(/share_links_target/);
    await db
      .insert(schema.shareLinks)
      .values({ ownerId: owner.id, tokenHash: "h2", scope: "list", listId, audience: "Mamie" });
    expect(
      await pgError(
        db
          .insert(schema.shareLinks)
          .values({ ownerId: owner.id, tokenHash: "h2", scope: "list", listId, audience: "Léo" }),
      ),
    ).toMatch(/share_links_token_idx|duplicate/);
  });
});
