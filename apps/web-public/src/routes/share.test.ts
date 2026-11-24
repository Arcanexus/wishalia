import { afterEach, describe, expect, it, vi } from "vitest";

import type { PublicView } from "#lib/types.ts";

import { POST as preferences } from "./preferences/+server.ts";
import { load } from "./s/[token]/+page.server.ts";

const TOKEN = "seMAnjFlgD6_iRanedLTsHKvmjcVQe8vfhnxt0upPZk";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const view = (patch: Partial<PublicView> = {}): PublicView => ({
  audience: "Mamie",
  scope: "list",
  viewer: "guest",
  owner: { displayName: "Léa" },
  me: null,
  list: { id: "l", name: "Mes envies", theme: null },
  event: null,
  events: [],
  items: [],
  ...patch,
});

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

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

function event(token = TOKEN, cookie?: string) {
  const headers: Record<string, string> = {};
  const locals = { themeChoice: "auto", mode: "device", listTheme: null, christmas: false } as App.Locals;
  const setHeaders = vi.fn();
  return {
    event: {
      params: { token },
      request: new Request(`https://wishalia.test/s/${token}`, { headers: cookie ? { cookie } : {} }),
      getClientAddress: () => "10.0.0.9",
      cookies: { get: () => undefined },
      locals,
      setHeaders,
    } as unknown as Parameters<typeof load>[0],
    locals,
    setHeaders,
    headers,
  };
}

const run = async (input: Parameters<typeof load>[0]) => {
  try {
    return { value: (await load(input)) as { view: PublicView; meta: { title: string } } };
  } catch (thrown) {
    return { thrown: thrown as { status: number; body?: { message: string } } };
  }
};

describe("the page of a share link", () => {
  it("sends the token in a header, never in the URL, with the cookies and the client address", async () => {
    vi.stubEnv("API_URL", "http://api:3000");
    const calls = api(() => json(view()));
    const { event: input, setHeaders } = event(TOKEN, "wishalia.session_token=s");
    const { value } = await run(input);
    expect(value?.view.owner.displayName).toBe("Léa");
    expect(calls[0]?.url).toBe("http://api:3000/public/view");
    expect(calls[0]?.url).not.toContain(TOKEN);
    expect(calls[0]?.headers.get("x-share-token")).toBe(TOKEN);
    expect(calls[0]?.headers.get("cookie")).toBe("wishalia.session_token=s");
    expect(calls[0]?.headers.get("x-forwarded-for")).toBe("10.0.0.9");
    expect(setHeaders).toHaveBeenCalledWith({ "cache-control": "private, no-store" });
  });

  it("answers the same 404 for an unknown link and a token that is not one, without asking for the latter", async () => {
    const calls = api(() => json({ error: "link_not_found" }, 404));
    expect((await run(event().event)).thrown).toMatchObject({ status: 404 });
    expect((await run(event("../../manage").event)).thrown).toMatchObject({ status: 404 });
    expect(calls).toHaveLength(1);
  });

  it("says the view is unavailable when the API fails, without details", async () => {
    api(() => json({ error: "internal" }, 500));
    expect((await run(event().event)).thrown).toMatchObject({ status: 503 });
  });

  it("gives the same title to every link, whatever the list", async () => {
    vi.stubEnv("APP_NAME", "Wishalia");
    api(() => json(view({ list: { id: "l", name: "Secret de Noël", theme: null } })));
    const { value } = await run(event().event);
    expect(value?.meta.title).toBe("Wishalia · une liste de souhaits");
    expect(JSON.stringify(value?.meta)).not.toContain("Secret");
  });

  it("puts what is still to give first", async () => {
    const item = (id: string, state: "free" | "complete") => ({
      ...view().items[0],
      id,
      kind: "unique",
      repeatable: false,
      title: id,
      url: null,
      notes: null,
      priceCents: null,
      targetCents: null,
      quantity: null,
      status: "open",
      eventIds: [],
      funding: { state, progress: state === "complete" ? 1 : 0, contributors: [] },
    });
    api(() =>
      json(view({ items: [item("taken", "complete"), item("free", "free")] as PublicView["items"] })),
    );
    const { value } = await run(event().event);
    expect(value?.view.items.map((entry) => entry.id)).toEqual(["free", "taken"]);
  });

  it("applies the list's forced theme, or Christmas for a Christmas event", async () => {
    api(() => json(view({ list: { id: "l", name: "x", theme: "neutral" } })));
    const forced = event();
    await run(forced.event);
    expect(forced.locals.listTheme).toBe("neutral");

    const christmas = { id: "e", name: "Noël", kind: "christmas" as const, date: "2026-12-24", open: true };
    api(() => json(view({ scope: "event", list: null, event: christmas, events: [christmas] })));
    const chosen = event();
    await run(chosen.event);
    expect(chosen.locals.christmas).toBe(true);
    expect(chosen.locals.listTheme).toBeNull();
  });
});

describe("/preferences", () => {
  const post = (retour: string, mode: App.Locals["mode"] = "device") => {
    const set = vi.fn();
    const request = new Request("https://wishalia.test/preferences", {
      method: "POST",
      body: new URLSearchParams({ retour }),
    });
    return {
      set,
      input: {
        request,
        url: new URL(request.url),
        cookies: { set },
        locals: { mode },
      } as unknown as Parameters<typeof preferences>[0],
    };
  };

  it("switches the mode on the device and goes back to the page, never to another site", async () => {
    for (const [retour, location] of [
      [`/s/${TOKEN}`, `/s/${TOKEN}`],
      ["//evil.example", "/"],
      ["https://evil.example", "/"],
    ] as const) {
      const { set, input } = post(retour, "light");
      await expect(preferences(input)).rejects.toMatchObject({ status: 303, location });
      expect(set).toHaveBeenCalledWith(
        "wishalia.mode",
        "dark",
        expect.objectContaining({ httpOnly: true, secure: true }),
      );
    }
  });
});
