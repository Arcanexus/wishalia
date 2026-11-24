import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./[...path]/+server.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/img", () => {
  it("answers 404 without imgproxy or for a path that is not signed", async () => {
    const call = (path: string) =>
      GET({ params: { path } } as Parameters<typeof GET>[0]) as Promise<Response>;
    expect((await call(`${"a".repeat(43)}/rs:fill:192:192:0/abc.webp`)).status).toBe(404);
    vi.stubEnv("IMGPROXY_URL", "http://imgproxy:8080");
    expect((await call("insecure/plain/http://10.0.0.1/x.webp")).status).toBe(404);
  });

  it("passes imgproxy's answer on", async () => {
    vi.stubEnv("IMGPROXY_URL", "http://imgproxy:8080");
    const fetch = vi.fn(
      async () => new Response(new Uint8Array([1]), { headers: { "content-type": "image/webp" } }),
    );
    vi.stubGlobal("fetch", fetch);
    const path = `${"a".repeat(43)}/rs:fill:192:192:0/abc.webp`;
    const answer = (await GET({ params: { path } } as Parameters<typeof GET>[0])) as Response;
    expect(answer.status).toBe(200);
    expect(fetch).toHaveBeenCalledWith(`http://imgproxy:8080/${path}`, expect.anything());
  });
});
