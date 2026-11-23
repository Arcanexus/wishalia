import { describe, expect, it } from "vitest";

import { proxyToApi } from "./api.ts";

function fakeApi(response: Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  const send = (async (url: URL, init: RequestInit) => {
    calls.push({ url: String(url), init });
    return response;
  }) as unknown as typeof fetch;
  return { calls, send };
}

describe("proxyToApi", () => {
  it("forwards the request to the API with the client address", async () => {
    const api = fakeApi(new Response("{}", { status: 200 }));
    await proxyToApi({
      request: new Request("https://app.test/auth/sign-in/magic-link", {
        method: "POST",
        headers: {
          cookie: "a=b",
          origin: "https://app.test",
          "content-type": "application/json",
          "x-forwarded-for": "6.6.6.6",
          authorization: "Bearer x",
        },
        body: '{"email":"a@x.test"}',
      }),
      path: "/auth/sign-in/magic-link?x=1",
      clientAddress: "10.0.0.7",
      apiUrl: "http://api:3000",
      fetch: api.send,
    });

    const [call] = api.calls;
    expect(call?.url).toBe("http://api:3000/auth/sign-in/magic-link?x=1");
    const headers = call?.init.headers as Headers;
    expect(headers.get("cookie")).toBe("a=b");
    expect(headers.get("origin")).toBe("https://app.test");
    expect(headers.get("x-forwarded-for")).toBe("10.0.0.7");
    expect(headers.get("authorization")).toBeNull();
    expect(call?.init.redirect).toBe("manual");
    expect(new TextDecoder().decode(call?.init.body as ArrayBuffer)).toBe('{"email":"a@x.test"}');
  });

  it("hands back the status, the redirect and every cookie", async () => {
    const headers = new Headers({ location: "/" });
    headers.append("set-cookie", "a=1; Path=/");
    headers.append("set-cookie", "b=2; Path=/");
    const api = fakeApi(new Response(null, { status: 302, headers }));
    const response = await proxyToApi({
      request: new Request("https://app.test/auth/magic-link/verify?token=t"),
      path: "/auth/magic-link/verify?token=t",
      clientAddress: "10.0.0.7",
      apiUrl: "http://api:3000",
      fetch: api.send,
    });
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/");
    expect(response.headers.getSetCookie()).toEqual(["a=1; Path=/", "b=2; Path=/"]);
    expect(api.calls[0]?.init.body).toBeUndefined();
  });

  it("fails clearly without API_URL", async () => {
    const response = await proxyToApi({
      request: new Request("https://app.test/auth/x"),
      path: "/auth/x",
      clientAddress: "1.1.1.1",
      apiUrl: "",
    });
    expect(response.status).toBe(500);
  });
});
