import { afterEach, describe, expect, it, vi } from "vitest";

import { load } from "./+page.server";

type LoadEvent = Parameters<typeof load>[0];

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("home page load", () => {
  it("uses the product name from the environment", async () => {
    vi.stubEnv("WISHLIST_APP_NAME", "Chut");
    expect(await load({} as LoadEvent)).toMatchObject({ meta: { title: "Chut · une liste de souhaits" } });
  });

  it("falls back to the code name", async () => {
    vi.stubEnv("WISHLIST_APP_NAME", undefined);
    expect(await load({} as LoadEvent)).toMatchObject({
      meta: { title: "wishlist · une liste de souhaits" },
    });
  });
});
