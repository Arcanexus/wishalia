import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json } from "../test/event.ts";
import { load } from "./(app)/listes/[id]/+page.server.ts";
import { GET } from "./(app)/listes/[id]/suivi/+server.ts";

const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

afterEach(() => vi.unstubAllGlobals());

const ask = async () => {
  const { event } = fakeEvent({ params: { id: LIST }, cookie: "wishalia.session=s" });
  const response = await GET(event as unknown as Parameters<typeof GET>[0]);
  return {
    status: response.status,
    body: await response.json(),
    cache: response.headers.get("cache-control"),
  };
};

describe("the list's live answer", () => {
  it("passes on the version and the count only, never cached, with the person's session", async () => {
    const api = fakeApi({
      [`GET /manage/lists/${LIST}/live`]: () => json({ version: "v1", live: 2, extra: "never" }),
    });
    expect(await ask()).toEqual({
      status: 200,
      body: { version: "v1", live: 2 },
      cache: "private, no-store",
    });
    expect(api.calls[0]?.headers.get("cookie")).toBe("wishalia.session=s");
  });

  it("answers a plain status for a script: signed out, someone else's list, an API down", async () => {
    fakeApi({ [`GET /manage/lists/${LIST}/live`]: () => json({ error: "unauthenticated" }, 401) });
    expect(await ask()).toMatchObject({ status: 401, cache: "private, no-store" });
    fakeApi({});
    expect(await ask()).toMatchObject({ status: 404, body: { error: "not_found" } });
    fakeApi({ [`GET /manage/lists/${LIST}/live`]: () => json({ error: "bad_request" }, 400) });
    expect((await ask()).status).toBe(404);
    fakeApi({ [`GET /manage/lists/${LIST}/live`]: () => json({ error: "internal" }, 500) });
    expect(await ask()).toMatchObject({ status: 503, body: { error: "unavailable" } });
  });

  it("is what the list page reloads", async () => {
    fakeApi({
      "GET /manage/lists": () =>
        json([{ id: LIST, theme: null, revealMode: "received", secretLifted: false }]),
      [`GET /manage/lists/${LIST}/items`]: () => json([]),
    });
    const { event } = fakeEvent({ params: { id: LIST } });
    await load(event as unknown as Parameters<typeof load>[0]);
    expect(event.dependencies).toEqual(["wishalia:list"]);
  });
});
