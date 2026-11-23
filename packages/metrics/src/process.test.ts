import type { AddressInfo } from "node:net";

import { describe, expect, it } from "vitest";

import { processMetrics } from "./process.js";

describe("processMetrics", () => {
  it("creates the metrics of a component once per process", () => {
    const first = processMetrics("web-test", "1.0.0");
    expect(processMetrics("web-test", "1.0.0")).toBe(first);
    expect(processMetrics("web-other", "1.0.0")).not.toBe(first);
  });

  it("starts the server once, however many times it is asked", async () => {
    const metrics = processMetrics("web-start", "1.0.0");
    expect(await metrics.start(0)).toBeNull();

    const fresh = processMetrics("web-listen", "1.0.0");
    const [a, b] = await Promise.all([fresh.start(0), fresh.start(0)]);
    expect(a).toBe(b);
  });

  it("serves its registry once started", async () => {
    const metrics = processMetrics("web-serve", "2.0.0");
    // Any free port: start() itself only refuses 0, so pick one through a throwaway server
    const { createServer } = await import("node:http");
    const probe = createServer();
    await new Promise<void>((done) => probe.listen(0, "127.0.0.1", done));
    const port = (probe.address() as AddressInfo).port;
    await new Promise((done) => probe.close(done));

    const server = await metrics.start(port, { host: "127.0.0.1" });
    try {
      const text = await (await fetch(`http://127.0.0.1:${port}/metrics`)).text();
      expect(text).toContain('wishalia_build_info{version="2.0.0",component="web-serve"} 1');
    } finally {
      await new Promise((done) => server?.close(done));
    }
  });
});
