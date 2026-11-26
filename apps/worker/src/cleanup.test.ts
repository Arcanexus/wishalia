import { schema, type Database } from "@wishalia/db";
import { createTestDb } from "@wishalia/db/testing";
import { memoryStorage, type Storage } from "@wishalia/storage";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { cleanupSettingsFromEnv, startCleanup, sweepImages } from "./cleanup.js";

let db: Database;
let close: () => Promise<void>;
let wishId: string;
let listId: string;

/** The one row a query gives, or the test fails. */
function one<T>(rows: T[]): T {
  const [row] = rows;
  if (!row) throw new Error("no row");
  return row;
}

beforeAll(async () => {
  ({ db, close } = await createTestDb());
  const user = one(
    await db.insert(schema.users).values({ displayName: "Léa", email: "lea@example.test" }).returning(),
  );
  const list = one(
    await db.insert(schema.wishLists).values({ ownerId: user.id, name: "Mes envies" }).returning(),
  );
  listId = list.id;
  wishId = one(await db.insert(schema.wishes).values({ listId: list.id, title: "Lampe" }).returning()).id;
});
afterAll(() => close());

const HOUR = 3_600_000;
const clock = new Date("2026-11-25T12:00:00Z");
const ago = (hours: number) => new Date(clock.getTime() - hours * HOUR);
const file = (modifiedAt: Date) => ({ body: new Uint8Array([1]), contentType: "image/png", modifiedAt });

describe("sweepImages", () => {
  it("removes the old files no image names, and keeps the named and the recent ones", async () => {
    const storage = memoryStorage();
    storage.objects.set(`wishes/${wishId}/shown`, file(ago(100)));
    storage.objects.set(`wishes/${wishId}/orphan`, file(ago(30)));
    storage.objects.set(`wishes/${wishId}/fresh`, file(ago(2)));
    storage.objects.set("elsewhere/kept", file(ago(100)));
    await db.insert(schema.wishImages).values({
      wishId,
      source: "page",
      key: `wishes/${wishId}/shown`,
      contentType: "image/png",
      bytes: 1,
    });
    const result = await sweepImages({ db, storage, graceMs: 24 * HOUR, now: () => clock });
    expect(result).toEqual({ checked: 3, removed: 1, failed: 0 });
    expect([...storage.objects.keys()].sort()).toEqual([
      "elsewhere/kept",
      `wishes/${wishId}/fresh`,
      `wishes/${wishId}/shown`,
    ]);
  });

  it("keeps the picture a list shows and removes the ones it no longer does", async () => {
    const storage = memoryStorage();
    storage.objects.set(`lists/${listId}/shown`, file(ago(100)));
    storage.objects.set(`lists/${listId}/replaced`, file(ago(30)));
    storage.objects.set(`lists/${listId}/fresh`, file(ago(2)));
    await db
      .update(schema.wishLists)
      .set({ imageKey: `lists/${listId}/shown` })
      .where(eq(schema.wishLists.id, listId));
    const result = await sweepImages({ db, storage, graceMs: 24 * HOUR, now: () => clock });
    expect(result).toEqual({ checked: 3, removed: 1, failed: 0 });
    expect([...storage.objects.keys()].sort()).toEqual([`lists/${listId}/fresh`, `lists/${listId}/shown`]);
  });

  it("counts a removal that fails, for the next sweep, and stops when the worker stops", async () => {
    const memory = memoryStorage();
    memory.objects.set("wishes/x/a", file(ago(48)));
    const storage: Storage = {
      ...memory,
      delete: async () => {
        throw new Error("S3 away");
      },
    };
    expect(await sweepImages({ db, storage, graceMs: HOUR, now: () => clock })).toEqual({
      checked: 1,
      removed: 0,
      failed: 1,
    });
    expect(
      await sweepImages({ db, storage: memory, graceMs: HOUR, now: () => clock, isRunning: () => false }),
    ).toEqual({ checked: 0, removed: 0, failed: 0 });
    expect(memory.objects.size).toBe(1);
  });
});

describe("cleanupSettingsFromEnv", () => {
  it("sweeps every 6 hours and spares a day by default, and refuses what is not a number of hours", () => {
    expect(cleanupSettingsFromEnv({})).toEqual({ intervalMs: 6 * HOUR, graceMs: 24 * HOUR });
    expect(
      cleanupSettingsFromEnv({ IMAGE_CLEANUP_INTERVAL_HOURS: "0", IMAGE_CLEANUP_GRACE_HOURS: "48" }),
    ).toEqual({ intervalMs: 0, graceMs: 48 * HOUR });
    expect(() => cleanupSettingsFromEnv({ IMAGE_CLEANUP_GRACE_HOURS: "0" })).toThrow(
      "IMAGE_CLEANUP_GRACE_HOURS",
    );
    expect(() => cleanupSettingsFromEnv({ IMAGE_CLEANUP_INTERVAL_HOURS: "soon" })).toThrow(
      "IMAGE_CLEANUP_INTERVAL_HOURS",
    );
  });
});

describe("startCleanup", () => {
  it("sweeps after the first delay then at each interval, counts and logs, and stops", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const storage = memoryStorage();
    storage.objects.set("wishes/y/orphan", file(new Date(0)));
    const observe = vi.fn();
    const log = vi.fn();
    const cleanup = startCleanup({
      db,
      storage,
      graceMs: HOUR,
      intervalMs: 1000,
      firstDelayMs: 10,
      metrics: { observe },
      log,
    });
    expect(observe).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(10);
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(1));
    expect(observe).toHaveBeenCalledWith({ checked: 1, removed: 1, failed: 0 });
    expect(log).toHaveBeenCalledWith(expect.stringContaining("1 unused file(s) removed"));
    await vi.advanceTimersByTimeAsync(1000);
    await vi.waitFor(() => expect(observe).toHaveBeenCalledTimes(2));
    await cleanup.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(observe).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("counts a sweep that fails, and does nothing when turned off", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    const observe = vi.fn();
    const log = vi.fn();
    const broken: Storage = {
      ...memoryStorage(),
      // eslint-disable-next-line require-yield
      async *list() {
        throw new Error("listing refused");
      },
    };
    const cleanup = startCleanup({
      db,
      storage: broken,
      graceMs: HOUR,
      intervalMs: 1000,
      firstDelayMs: 0,
      metrics: { observe },
      log,
    });
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(observe).toHaveBeenCalledWith("error"));
    expect(log).toHaveBeenCalledWith("image cleanup: listing refused");
    await cleanup.stop();
    const off = startCleanup({ db, storage: broken, graceMs: HOUR, intervalMs: 0, metrics: { observe } });
    await off.stop();
    expect(observe).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
});
