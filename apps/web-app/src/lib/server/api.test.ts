import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeCookies, fakeEvent, json, outcome } from "../../test/event.ts";
import { ApiError, apiFetch, apiJson, apiUrl, forwardSetCookies, safeReturnPath } from "./api.ts";
import { MODE_COOKIE, readPreferences, TEXT_COOKIE, THEME_COOKIE, writePreference } from "./preferences.ts";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("apiUrl", () => {
  it("uses API_URL, the local API in development, and refuses to guess in production", () => {
    vi.stubEnv("API_URL", "http://api:3000");
    expect(apiUrl()).toBe("http://api:3000");
    vi.stubEnv("API_URL", undefined);
    vi.stubEnv("NODE_ENV", "development");
    expect(apiUrl()).toBe("http://localhost:3000");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => apiUrl()).toThrow();
  });
});

describe("apiFetch", () => {
  it("sends the person's cookies, the real client address and the app's origin", async () => {
    const api = fakeApi({ "POST /x": () => json({}) });
    const { event } = fakeEvent({ cookie: "wishalia.session=abc" });
    await apiFetch(event, "/x", { method: "POST", body: { a: 1 } });
    const headers = api.calls[0]?.headers;
    expect(headers?.get("cookie")).toBe("wishalia.session=abc");
    expect(headers?.get("x-forwarded-for")).toBe("10.0.0.7");
    expect(headers?.get("origin")).toBe("https://app.test");
    expect(headers?.get("content-type")).toBe("application/json");
    expect(api.calls[0]?.body).toEqual({ a: 1 });
  });
});

describe("apiJson", () => {
  it("returns the answer, nothing on 204, and an ApiError otherwise", async () => {
    fakeApi({
      "GET /ok": () => json({ a: 1 }),
      "DELETE /gone": () => new Response(null, { status: 204 }),
      "GET /broken": () => new Response("oops", { status: 502 }),
    });
    const { event } = fakeEvent();
    expect(await apiJson(event, "/ok")).toEqual({ a: 1 });
    expect(await apiJson(event, "/gone", { method: "DELETE" })).toBeUndefined();
    const failure = (await outcome(() => apiJson(event, "/broken"))).thrown;
    expect(failure).toBeInstanceOf(ApiError);
    expect(failure).toMatchObject({ status: 502, code: "unknown" });
  });
});

describe("forwardSetCookies", () => {
  it("passes each cookie on with its attributes, untouched", () => {
    const response = new Response(null);
    response.headers.append(
      "set-cookie",
      "__Secure-wishalia.session=a%2Fb; Path=/; Domain=example.test; Max-Age=60; HttpOnly; Secure; SameSite=Lax",
    );
    response.headers.append("set-cookie", "state=xyz; Expires=Wed, 01 Jan 2031 00:00:00 GMT");
    response.headers.append("set-cookie", "=broken");
    const { cookies, set } = fakeCookies();
    forwardSetCookies(cookies, response);
    expect(set).toHaveLength(2);
    expect(set[0]).toMatchObject({
      name: "__Secure-wishalia.session",
      value: "a%2Fb",
      options: {
        path: "/",
        domain: "example.test",
        maxAge: 60,
        httpOnly: true,
        secure: true,
        sameSite: "lax",
      },
    });
    expect(set[0]?.options?.encode?.("a%2Fb")).toBe("a%2Fb");
    expect(set[1]).toMatchObject({ name: "state", options: { secure: false, httpOnly: false } });
    expect(set[1]?.options?.expires?.getUTCFullYear()).toBe(2031);
  });
});

describe("safeReturnPath", () => {
  it("only goes back to a path of this app", () => {
    expect(safeReturnPath("/listes/1?x=2")).toBe("/listes/1?x=2");
    for (const unsafe of [
      null,
      "",
      "https://evil.test",
      "//evil.test",
      "/\\evil.test",
      "javascript:alert(1)",
    ]) {
      expect(safeReturnPath(unsafe)).toBe("/");
    }
  });
});

describe("preferences", () => {
  it("reads the theme and mode, falling back on the defaults", () => {
    expect(
      readPreferences(fakeCookies({ [THEME_COOKIE]: "christmas", [MODE_COOKIE]: "dark" }).cookies),
    ).toEqual({
      themeChoice: "christmas",
      mode: "dark",
      localeChoice: "auto",
      textSize: "normal",
    });
    expect(
      readPreferences(
        fakeCookies({ [MODE_COOKIE]: "neon", "wishalia.locale": "en", [TEXT_COOKIE]: "larger" }).cookies,
      ),
    ).toEqual({
      themeChoice: "auto",
      mode: "device",
      localeChoice: "en",
      textSize: "larger",
    });
  });

  it("keeps a choice for a year, out of reach of scripts", () => {
    const { cookies, set } = fakeCookies();
    writePreference(cookies, MODE_COOKIE, "light", true);
    expect(set[0]).toMatchObject({
      value: "light",
      options: { maxAge: 31_536_000, httpOnly: true, secure: true, sameSite: "lax" },
    });
  });
});
