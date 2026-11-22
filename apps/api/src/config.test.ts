import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("has safe defaults", () => {
    expect(loadConfig({})).toMatchObject({ PORT: 3000, APP_NAME: "wishlist", NODE_ENV: "development" });
  });

  it("reads the environment", () => {
    expect(loadConfig({ PORT: "8080", APP_NAME: "Chut" })).toMatchObject({ PORT: 8080, APP_NAME: "Chut" });
  });

  it("lists every invalid variable", () => {
    expect(() => loadConfig({ PORT: "0", LOG_LEVEL: "loud" })).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});
