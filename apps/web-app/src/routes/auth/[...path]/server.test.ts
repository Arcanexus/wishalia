import { afterEach, describe, expect, it, vi } from "vitest";

import { GET, POST } from "./+server.ts";

type Event = Parameters<typeof GET>[0];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("/auth/*", () => {
  it.each([
    ["GET", GET],
    ["POST", POST],
  ])("proxies %s to the API, path and query string included", async (method, handler) => {
    vi.stubEnv("API_URL", "http://api:3000");
    const fetchMock = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    const url = new URL("https://app.test/auth/get-session?x=1");
    const event = {
      request: new Request(url, { method }),
      url,
      getClientAddress: () => "10.0.0.1",
    } as unknown as Event;

    const response = await handler(event);
    expect(await response.text()).toBe("ok");
    expect(String((fetchMock.mock.calls[0] as unknown[])[0])).toBe("http://api:3000/auth/get-session?x=1");
  });
});
