import { createHttpMetrics, createRegistry } from "@wishlist/metrics";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createTestApp, type TestApp } from "./test/app.js";

let t: TestApp;

beforeAll(async () => {
  t = await createTestApp({ APP_VERSION: "1.2.3" });
}, 30_000);

afterAll(async () => {
  await t.close();
});

describe("health probes", () => {
  it("answers /healthz with the name and the version", async () => {
    const response = await t.app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", name: "wishlist", version: "1.2.3" });
  });

  it("answers /readyz once the database answers", async () => {
    const response = await t.app.inject({ method: "GET", url: "/readyz" });
    expect(response.json()).toEqual({ status: "ready" });
  });

  it("is not ready without its database", async () => {
    const other = await createTestApp();
    const db = other.db as unknown as { execute: () => Promise<never> };
    db.execute = () => Promise.reject(new Error("connection refused"));
    const response = await other.app.inject({ method: "GET", url: "/readyz" });
    expect(response.statusCode).toBe(503);
    await other.close();
  }, 30_000);
});

describe("scopes", () => {
  it("runs /public in the public scope", async () => {
    const response = await t.app.inject({ method: "GET", url: "/public/ping" });
    expect(response.json()).toEqual({ scope: "public" });
  });

  it("does not leak a scope outside its prefix", async () => {
    const response = await t.app.inject({ method: "GET", url: "/ping" });
    expect(response.statusCode).toBe(404);
  });
});

describe("security headers", () => {
  it("sends a deny-all CSP and no referrer", async () => {
    const response = await t.app.inject({ method: "GET", url: "/healthz" });
    expect(response.headers["content-security-policy"]).toContain("default-src 'none'");
    expect(response.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    expect(response.headers["referrer-policy"]).toBe("no-referrer");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("metrics", () => {
  it("records each request under its route pattern, never its URL", async () => {
    const registry = createRegistry({ component: "api", version: "dev", defaultMetrics: false });
    const measured = await buildApp(loadConfig({ NODE_ENV: "test" }), {
      db: t.db,
      metrics: createHttpMetrics(registry),
    });
    try {
      await measured.inject({ method: "GET", url: "/public/ping" });
      await measured.inject({ method: "GET", url: "/no/such/route/secret-token" });

      const text = await registry.metrics();
      expect(text).toMatch(
        /_count\{component="api",method="GET",route="\/public\/ping",status_code="200"\} 1/,
      );
      expect(text).toMatch(/_count\{component="api",method="GET",route="unmatched",status_code="404"\} 1/);
      expect(text).not.toContain("secret-token");
    } finally {
      await measured.close();
    }
  });
});
