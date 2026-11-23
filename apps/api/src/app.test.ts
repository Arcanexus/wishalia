import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createHttpMetrics, createRegistry } from "@wishlist/metrics";

import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";

let app: FastifyInstance;

beforeAll(async () => {
  app = await buildApp(loadConfig({ NODE_ENV: "test", APP_VERSION: "1.2.3" }));
});

afterAll(async () => {
  await app.close();
});

describe("health probes", () => {
  it("answers /healthz with the name and the version", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok", name: "wishlist", version: "1.2.3" });
  });

  it("answers /readyz", async () => {
    const response = await app.inject({ method: "GET", url: "/readyz" });
    expect(response.json()).toEqual({ status: "ready" });
  });
});

describe("scopes", () => {
  it.each([
    ["/manage/ping", "manage"],
    ["/public/ping", "public"],
  ])("%s runs in the %s scope", async (url, scope) => {
    const response = await app.inject({ method: "GET", url });
    expect(response.json()).toEqual({ scope });
  });

  it("does not leak a scope outside its prefix", async () => {
    const response = await app.inject({ method: "GET", url: "/ping" });
    expect(response.statusCode).toBe(404);
  });
});

describe("security headers", () => {
  it("sends a deny-all CSP and no referrer", async () => {
    const response = await app.inject({ method: "GET", url: "/healthz" });
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
      metrics: createHttpMetrics(registry),
    });
    try {
      await measured.inject({ method: "GET", url: "/manage/ping" });
      await measured.inject({ method: "GET", url: "/no/such/route/secret-token" });

      const text = await registry.metrics();
      expect(text).toMatch(
        /_count\{component="api",method="GET",route="\/manage\/ping",status_code="200"\} 1/,
      );
      expect(text).toMatch(/_count\{component="api",method="GET",route="unmatched",status_code="404"\} 1/);
      expect(text).not.toContain("secret-token");
    } finally {
      await measured.close();
    }
  });
});
