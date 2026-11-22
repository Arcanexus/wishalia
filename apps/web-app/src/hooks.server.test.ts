import { describe, expect, it } from "vitest";

import { handle } from "./hooks.server";

type HandleInput = Parameters<typeof handle>[0];

describe("handle", () => {
  it("adds the security headers to every response", async () => {
    const input = { event: {}, resolve: async () => new Response("ok") } as unknown as HandleInput;
    const response = await handle(input);
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(response.headers.get("x-frame-options")).toBe("DENY");
    expect(response.headers.get("cross-origin-opener-policy")).toBe("same-origin");
    expect(response.headers.get("permissions-policy")).toContain("camera=()");
  });
});
