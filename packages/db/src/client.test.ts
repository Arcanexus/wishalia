import { describe, expect, it } from "vitest";

import { createDb } from "./client.js";

describe("createDb", () => {
  it("refuses to start without a database URL", () => {
    expect(() => createDb({ url: "" })).toThrow("DATABASE_URL is required");
  });

  it("opens a lazy pool that can be closed without connecting", async () => {
    const { db, close } = createDb({ url: "postgres://user:pass@localhost:1/none" });
    expect(db).toBeDefined();
    await expect(close()).resolves.toBeUndefined();
  });
});
