import { afterEach, describe, expect, it, vi } from "vitest";

import { GET } from "./+server";

afterEach(() => vi.unstubAllEnvs());

describe("GET /manifest.webmanifest", () => {
  it("serves the manifest with the app's name, as a manifest", async () => {
    vi.stubEnv("APP_NAME", "Nos envies");
    const response = await GET({ locals: { locale: "en" } } as Parameters<typeof GET>[0]);
    expect(response.headers.get("content-type")).toBe("application/manifest+json");
    expect(await response.json()).toMatchObject({
      name: "Nos envies",
      lang: "en-GB",
      share_target: { action: "/ajouter" },
    });
    expect(response.headers.get("vary")).toContain("Accept-Language");
  });

  it("is called Wishalia by default", async () => {
    vi.stubEnv("APP_NAME", undefined);
    expect(await (await GET({ locals: { locale: "fr" } } as Parameters<typeof GET>[0])).json()).toMatchObject({ name: "Wishalia" });
  });
});
