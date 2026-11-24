import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { isNotReachableYet, migrationsFolder, runMigrations } from "./migrate.js";

describe("runMigrations", () => {
  it("ships the migrations with the package", () => {
    expect(existsSync(join(migrationsFolder, "meta", "_journal.json"))).toBe(true);
  });

  it("refuses to run without a database URL", async () => {
    await expect(runMigrations("")).rejects.toThrow("DATABASE_URL is required");
  });

  it("fails, and closes its connection, when the database is unreachable", async () => {
    await expect(runMigrations("postgres://user:pass@127.0.0.1:1/none")).rejects.toThrow();
  });

  it("waits for a database that is not there yet, then gives up", async () => {
    const started = Date.now();
    await expect(
      runMigrations("postgres://user:pass@127.0.0.1:1/none", { waitMs: 300, retryMs: 100 }),
    ).rejects.toMatchObject({ code: "ECONNREFUSED" });
    expect(Date.now() - started).toBeGreaterThanOrEqual(200);
  });

  it("only waits for a database that is not reachable yet", () => {
    expect(isNotReachableYet(Object.assign(new Error("refused"), { code: "ECONNREFUSED" }))).toBe(true);
    expect(isNotReachableYet(Object.assign(new Error("starting"), { code: "57P03" }))).toBe(true);
    // A wrong password or a broken migration never gets better by waiting
    expect(isNotReachableYet(Object.assign(new Error("password"), { code: "28P01" }))).toBe(false);
    expect(isNotReachableYet(new Error("syntax"))).toBe(false);
    expect(isNotReachableYet(null)).toBe(false);
  });
});
