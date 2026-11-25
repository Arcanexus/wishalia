import { afterEach, describe, expect, it, vi } from "vitest";

import { appOrigin } from "#lib/server/api.ts";

import { actions, load } from "./+page.server";

type LoadEvent = Parameters<typeof load>[0];
type ActionEvent = Parameters<NonNullable<typeof actions.open>>[0];

const TOKEN = "a".repeat(43);

function loadEvent(search = "", cookie?: string) {
  const headers: Record<string, string> = {};
  const event = {
    url: new URL(`https://wishalia.test/${search}`),
    request: new Request("https://wishalia.test/", { headers: cookie ? { cookie } : {} }),
    getClientAddress: () => "203.0.113.9",
    setHeaders: (values: Record<string, string>) => Object.assign(headers, values),
    locals: { locale: "fr" },
  };
  return { event: event as unknown as LoadEvent, headers };
}

function apiAnswer(body: unknown, status = 200) {
  const calls: { url: string; headers: Headers }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: URL, init: RequestInit) => {
      calls.push({ url: url.toString(), headers: new Headers(init.headers) });
      return new Response(JSON.stringify(body), { status });
    }),
  );
  return calls;
}

const HOME = { me: null, query: "", lists: [], more: false };

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("home page load", () => {
  it("uses the product name from the environment", async () => {
    vi.stubEnv("APP_NAME", "Chut");
    apiAnswer(HOME);
    expect(await load(loadEvent().event)).toMatchObject({ meta: { title: "Chut · une liste de souhaits" } });
  });

  it("falls back to the code name", async () => {
    vi.stubEnv("APP_NAME", undefined);
    apiAnswer(HOME);
    expect(await load(loadEvent().event)).toMatchObject({
      meta: { title: "Wishalia · une liste de souhaits" },
    });
  });

  it("asks the API for the public lists, with the search and the session, never cached", async () => {
    vi.stubEnv("API_URL", "http://api.test");
    vi.stubEnv("APP_ORIGIN", "https://app.wishalia.test");
    const calls = apiAnswer({
      me: { displayName: "Paul" },
      query: "léa",
      lists: [
        { name: "Anniversaire", ownerName: "Léa", itemCount: 3, path: `/s/${TOKEN}` },
        { name: "Ailleurs", ownerName: "X", itemCount: 1, path: "https://evil.test/" },
      ],
      more: false,
    });
    const { event, headers } = loadEvent("?q=l%C3%A9a", "wishalia.session=1");
    const data = await load(event);
    expect(calls[0]?.url).toBe("http://api.test/public/home?q=l%C3%A9a");
    expect(calls[0]?.headers.get("cookie")).toBe("wishalia.session=1");
    expect(calls[0]?.headers.get("x-share-token")).toBeNull();
    expect(headers["cache-control"]).toBe("private, no-store");
    expect(data).toMatchObject({
      searched: "léa",
      signInUrl: "https://app.wishalia.test/connexion",
      appUrl: "https://app.wishalia.test/",
      home: { me: { displayName: "Paul" } },
    });
    // Only addresses of this host
    expect(data && "home" in data ? data.home.lists : []).toHaveLength(1);
  });

  it("answers 503 when the API fails", async () => {
    apiAnswer({}, 500);
    await expect(load(loadEvent().event)).rejects.toMatchObject({ status: 503 });
  });
});

describe("appOrigin", () => {
  it("takes an http(s) origin only", () => {
    vi.stubEnv("APP_ORIGIN", "https://app.wishalia.test/x");
    expect(appOrigin()).toBe("https://app.wishalia.test");
    vi.stubEnv("APP_ORIGIN", "javascript:alert(1)");
    expect(appOrigin()).toBeNull();
    vi.stubEnv("APP_ORIGIN", "not a url");
    expect(appOrigin()).toBeNull();
  });

  it("has none in production without the setting", () => {
    vi.stubEnv("APP_ORIGIN", undefined);
    vi.stubEnv("NODE_ENV", "production");
    expect(appOrigin()).toBeNull();
  });
});

describe("opening a pasted link", () => {
  const open = (link: string) => {
    const body = new FormData();
    body.set("link", link);
    const action = actions.open;
    if (!action) throw new Error("no open action");
    return action({
      request: new Request("https://wishalia.test/?/open", { method: "POST", body }),
    } as unknown as ActionEvent);
  };

  it("goes to the link, from the whole address or the token alone", async () => {
    for (const link of [
      `https://wishalia.test/s/${TOKEN}`,
      ` ${TOKEN} `,
      `https://autre.test/s/${TOKEN}?x=1`,
    ]) {
      await expect(open(link)).rejects.toMatchObject({ status: 303, location: `/s/${TOKEN}` });
    }
  });

  it("says when the text holds no link", async () => {
    expect(await open("bonjour")).toMatchObject({ status: 400, data: { open: { error: "invalid_link" } } });
    expect(await open(`https://wishalia.test/s/${TOKEN}x`)).toMatchObject({ status: 400 });
  });
});
