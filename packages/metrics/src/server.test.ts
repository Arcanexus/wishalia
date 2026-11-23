import type { AddressInfo } from "node:net";
import type { Server } from "node:http";

import { afterEach, describe, expect, it } from "vitest";

import { createRegistry } from "./registry.js";
import { createMetricsServer, metricsPort, startMetricsServer } from "./server.js";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise((done) => server.close(done))));
});

async function listen(server: Server): Promise<string> {
  servers.push(server);
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

const registry = createRegistry({ component: "api", version: "9.9.9", defaultMetrics: false });

describe("createMetricsServer", () => {
  it("serves the metrics in the Prometheus text format", async () => {
    const base = await listen(createMetricsServer(registry));
    const response = await fetch(`${base}/metrics`);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(registry.contentType);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toContain('version="9.9.9"');
  });

  it("ignores the query string", async () => {
    const base = await listen(createMetricsServer(registry));
    expect((await fetch(`${base}/metrics?x=1`)).status).toBe(200);
  });

  it("answers HEAD without a body", async () => {
    const base = await listen(createMetricsServer(registry));
    const response = await fetch(`${base}/metrics`, { method: "HEAD" });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("");
  });

  it("serves nothing else", async () => {
    const base = await listen(createMetricsServer(registry));
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/healthz`)).status).toBe(404);
    const post = await fetch(`${base}/metrics`, { method: "POST" });
    expect(post.status).toBe(405);
    expect(post.headers.get("allow")).toBe("GET, HEAD");
  });

  it("answers 500 when a collector fails", async () => {
    const failing = createRegistry({ component: "api", version: "dev", defaultMetrics: false });
    failing.metrics = () => Promise.reject(new Error("boom"));
    const base = await listen(createMetricsServer(failing));
    expect((await fetch(`${base}/metrics`)).status).toBe(500);
  });
});

describe("metricsPort", () => {
  it("is off when unset, empty or 0", () => {
    expect(metricsPort({})).toBe(0);
    expect(metricsPort({ METRICS_PORT: " " })).toBe(0);
    expect(metricsPort({ METRICS_PORT: "0" })).toBe(0);
  });

  it("reads a port", () => {
    expect(metricsPort({ METRICS_PORT: "9464" })).toBe(9464);
  });

  it("refuses anything that is not a port", () => {
    for (const value of ["abc", "-1", "65536", "94.64"]) {
      expect(() => metricsPort({ METRICS_PORT: value })).toThrow(/METRICS_PORT/);
    }
  });
});

describe("startMetricsServer", () => {
  it("does nothing when the port is 0", async () => {
    expect(await startMetricsServer(registry, 0)).toBeNull();
  });

  it("listens on the given port", async () => {
    // Find a free port, then start on it
    const probe = createMetricsServer(registry);
    const port = Number(new URL(await listen(probe)).port);
    await new Promise((done) => probe.close(done));
    servers.splice(servers.indexOf(probe), 1);

    const server = await startMetricsServer(registry, port, { host: "127.0.0.1" });
    expect(server).not.toBeNull();
    if (server) servers.push(server);
    expect((await fetch(`http://127.0.0.1:${port}/metrics`)).status).toBe(200);
  });

  it("reports a port already in use instead of crashing the application", async () => {
    const taken = Number(new URL(await listen(createMetricsServer(registry))).port);
    const errors: Error[] = [];
    const server = await startMetricsServer(registry, taken, {
      host: "127.0.0.1",
      onError: (error) => errors.push(error),
    });
    expect(server).toBeNull();
    expect(errors[0]?.message).toMatch(/EADDRINUSE/);
  });

  it("swallows the error when no handler is given", async () => {
    const taken = Number(new URL(await listen(createMetricsServer(registry))).port);
    expect(await startMetricsServer(registry, taken, { host: "127.0.0.1" })).toBeNull();
  });
});
