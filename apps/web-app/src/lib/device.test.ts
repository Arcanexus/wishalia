import { describe, expect, it } from "vitest";

import { platform, shortcutAddress } from "./device.ts";

describe("platform", () => {
  it("recognises Android, iPhone and iPad, and computers", () => {
    expect(platform("Mozilla/5.0 (Linux; Android 15; Pixel 9) Chrome/131 Mobile")).toBe("android");
    expect(platform("Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) Safari/604.1")).toBe("ios");
    expect(platform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15", 5)).toBe("ios");
    expect(platform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Safari/605.1.15")).toBe("computer");
    expect(platform("Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131")).toBe("computer");
  });
});

describe("shortcutAddress", () => {
  it("opens the add page of this app", () => {
    expect(shortcutAddress("https://app.wishalia.test")).toBe("https://app.wishalia.test/ajouter?text=");
  });
});
