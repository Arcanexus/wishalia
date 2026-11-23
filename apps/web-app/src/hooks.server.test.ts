import { processMetrics } from "@wishalia/metrics";
import { describe, expect, it } from "vitest";

import { handle, init } from "./hooks.server.ts";

type HandleInput = Parameters<typeof handle>[0];

function request(routeId: string | null, url: string, status = 200): HandleInput {
  return {
    event: { request: new Request(`https://example.test${url}`), route: { id: routeId } },
    resolve: async () => new Response("ok", { status }),
  } as unknown as HandleInput;
}

describe("hooks", () => {
  it("adds the security headers to every response", async () => {
    const response = await handle(request("/healthz", "/healthz"));
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
  });

  it("records the route id, never the URL", async () => {
    await handle(request("/[token]", "/s3cr3t-share-token"));
    await handle(request(null, "/missing", 404));

    const text = await processMetrics("web-app", "dev").registry.metrics();
    expect(text).toMatch(
      /_count\{component="web-app",method="GET",route="\/\[token\]",status_code="200"\} 1/,
    );
    expect(text).toMatch(/_count\{component="web-app",method="GET",route="unmatched",status_code="404"\} 1/);
    expect(text).not.toContain("s3cr3t");
  });

  it("starts no metrics server without METRICS_PORT", async () => {
    await expect(init()).resolves.toBeUndefined();
  });
});
