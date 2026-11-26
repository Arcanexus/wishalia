import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./s/[token]/suivi/+server.ts";

const TOKEN = "seMAnjFlgD6_iRanedLTsHKvmjcVQe8vfhnxt0upPZk";

afterEach(() => vi.unstubAllGlobals());

function api(answer: () => Response) {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit = {}) => {
      calls.push({ url: String(url), headers: new Headers(init.headers) });
      return answer();
    }),
  );
  return calls;
}
const json = (payload: unknown, status = 200) => new Response(JSON.stringify(payload), { status });

const ask = async (token = TOKEN) => {
  const event = {
    params: { token },
    request: new Request(`https://wishalia.test/s/${token}/suivi`),
    getClientAddress: () => "10.0.0.9",
  } as unknown as Parameters<typeof GET>[0];
  const response = await GET(event);
  return {
    status: response.status,
    body: await response.json(),
    cache: response.headers.get("cache-control"),
  };
};

describe("the guests' live answer", () => {
  it("passes on the version and the count only, the token in a header, never cached", async () => {
    const calls = api(() => json({ version: "v1", live: 1, more: "never" }));
    expect(await ask()).toEqual({
      status: 200,
      body: { version: "v1", live: 1 },
      cache: "private, no-store",
    });
    expect(calls[0]?.url).toMatch(/\/public\/live$/);
    expect(calls[0]?.headers.get("x-share-token")).toBe(TOKEN);
  });

  it("answers the same 404 for a malformed or unknown link, and 503 when the API is down", async () => {
    const calls = api(() => json({ error: "link_not_found" }, 404));
    expect(await ask("court")).toMatchObject({ status: 404, body: { error: "link_not_found" } });
    expect(calls).toHaveLength(0);
    expect((await ask()).status).toBe(404);
    api(() => json({ error: "internal" }, 500));
    expect(await ask()).toMatchObject({ status: 503, body: { error: "unavailable" } });
  });
});
