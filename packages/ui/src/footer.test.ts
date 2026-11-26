import { describe, expect, it } from "vitest";

import { GUIDES, helpUrl, shownVersion } from "./footer.ts";

describe("footer", () => {
  it("shows the image's release number, or the built version", () => {
    expect(shownVersion("0.1.0", "0.0.9")).toBe("0.1.0");
    expect(shownVersion("v1.2.3", "0.0.9")).toBe("1.2.3");
    expect(shownVersion("1.2.3-rc.1", "0.0.9")).toBe("1.2.3-rc.1");
    expect(shownVersion("dev", "0.0.9")).toBe("0.0.9");
    expect(shownVersion("main", "0.0.9")).toBe("0.0.9");
    expect(shownVersion(undefined, "0.0.9")).toBe("0.0.9");
    expect(shownVersion(" ", "0.0.9")).toBe("0.0.9");
  });

  it("leads to the guide in the page's language, or to the server's own help", () => {
    expect(helpUrl("fr", undefined)).toBe(GUIDES.fr);
    expect(helpUrl("en", "")).toBe(GUIDES.en);
    expect(helpUrl("fr", "https://aide.example.org/wishalia")).toBe("https://aide.example.org/wishalia");
    expect(helpUrl("en", "javascript:alert(1)")).toBe(GUIDES.en);
    expect(helpUrl("en", "not a url")).toBe(GUIDES.en);
  });
});
