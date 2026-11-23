import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";

describe("loadConfig", () => {
  it("has safe defaults", () => {
    expect(loadConfig({})).toMatchObject({ PORT: 3000, APP_NAME: "wishlist", NODE_ENV: "development" });
  });

  it("reads the environment", () => {
    expect(loadConfig({ PORT: "8080", APP_NAME: "Chut" })).toMatchObject({ PORT: 8080, APP_NAME: "Chut" });
  });

  it("turns the metrics off unless a port is given", () => {
    expect(loadConfig({}).METRICS_PORT).toBe(0);
    expect(loadConfig({ METRICS_PORT: "9464" }).METRICS_PORT).toBe(9464);
    expect(() => loadConfig({ METRICS_PORT: "70000" })).toThrow(/METRICS_PORT/);
  });

  it("lists every invalid variable", () => {
    expect(() => loadConfig({ PORT: "0", LOG_LEVEL: "loud" })).toThrow(/PORT[\s\S]*LOG_LEVEL/);
  });
});
