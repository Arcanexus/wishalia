import { describe, expect, it } from "vitest";

import { BAR_COLOURS, manifest, SHARE_PATH, themeColorTags } from "./install.ts";

describe("themeColorTags", () => {
  it("gives one colour when the person forced light or dark", () => {
    expect(themeColorTags("neutral", "light")).toBe('<meta name="theme-color" content="#ffffff" />');
    expect(themeColorTags("christmas", "dark")).toBe('<meta name="theme-color" content="#1c2621" />');
  });

  it("gives one colour per mode of the device otherwise", () => {
    const tags = themeColorTags("neutral", "device");
    expect(tags).toContain(`content="${BAR_COLOURS.neutral.light}" media="(prefers-color-scheme: light)"`);
    expect(tags).toContain(`content="${BAR_COLOURS.neutral.dark}" media="(prefers-color-scheme: dark)"`);
  });
});

describe("manifest", () => {
  const app = manifest("Wishalia", "fr");

  it("makes the app installable, standalone, with its name and icons", () => {
    expect(app).toMatchObject({
      name: "Wishalia",
      short_name: "Wishalia",
      start_url: "/",
      display: "standalone",
    });
    const sizes = app.icons.map((icon) => `${icon.sizes} ${icon.purpose}`);
    expect(sizes).toEqual(expect.arrayContaining(["192x192 any", "512x512 any", "512x512 maskable"]));
    expect(manifest("Nos envies", "fr").name).toBe("Nos envies");
    expect(app.lang).toBe("fr-FR");
    expect(manifest("Wishalia", "en")).toMatchObject({ lang: "en-GB", description: expect.stringContaining("family") });
  });

  it("puts the app in the share menu, on a page that asks before adding", () => {
    expect(app.share_target).toEqual({
      action: SHARE_PATH,
      method: "GET",
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    });
    expect(app.shortcuts.map((shortcut) => shortcut.url)).toContain(SHARE_PATH);
  });
});
