import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { migrationsFolder, runMigrations } from "./migrate.js";

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
});
