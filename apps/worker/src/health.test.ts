import type { AddressInfo } from "node:net";

import { afterEach, describe, expect, it } from "vitest";

import { createHealthServer } from "./health.js";

let close: (() => void) | undefined;

async function start(isHealthy: () => boolean): Promise<string> {
  const server = createHealthServer(isHealthy);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  close = () => server.close();
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

afterEach(() => close?.());

describe("health server", () => {
  it("answers 200 while running", async () => {
    const response = await fetch(`${await start(() => true)}/healthz`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });

  it("answers 503 once stopping", async () => {
    const response = await fetch(`${await start(() => false)}/healthz`);
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "stopping" });
  });

  it("answers 404 elsewhere", async () => {
    const base = await start(() => true);
    expect((await fetch(`${base}/`)).status).toBe(404);
    expect((await fetch(`${base}/healthz`, { method: "POST" })).status).toBe(404);
  });
});
