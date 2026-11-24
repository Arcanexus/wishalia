import { processMetrics } from "@wishalia/metrics";
import { describe, expect, it } from "vitest";

import { handle, init } from "./hooks.server.ts";

type HandleInput = Parameters<typeof handle>[0];

function request(
  routeId: string | null,
  url: string,
  status = 200,
  cookies: Record<string, string> = {},
): HandleInput {
  return {
    event: {
      request: new Request(`https://example.test${url}`),
      route: { id: routeId },
      cookies: { get: (name: string) => cookies[name] },
      locals: {},
    },
    resolve: async (
      _event: unknown,
      options?: { transformPageChunk?: (input: { html: string }) => string },
    ) =>
      new Response(
        options?.transformPageChunk?.({
          html: '<html data-theme="%wishalia.theme%" data-mode="%wishalia.mode%">',
        }) ?? "ok",
        { status },
      ),
  } as unknown as HandleInput;
}

describe("hooks", () => {
  it("adds the security headers to every response", async () => {
    const response = await handle(request("/healthz", "/healthz"));
    expect(response.headers.get("referrer-policy")).toBe("same-origin");
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

  it("renders the person's theme and mode on <html>, from their cookies", async () => {
    const response = await handle(
      request("/", "/", 200, { "wishalia.theme": "christmas", "wishalia.mode": "dark" }),
    );
    expect(await response.text()).toBe('<html data-theme="christmas" data-mode="dark">');
    const defaults = await handle(request("/", "/", 200, { "wishalia.theme": "pink" }));
    expect(await defaults.text()).toMatch(/data-theme="(neutral|christmas)" data-mode="device"/);
  });

  it("starts no metrics server without METRICS_PORT", async () => {
    await expect(init()).resolves.toBeUndefined();
  });
});
