import { describe, expect, it } from "vitest";

import { cleanUrl, diffWish, type EditableWish, MAX_TITLE_LENGTH, parseQuickAdd } from "./items.js";

describe("cleanUrl", () => {
  it("removes the tracking parameters and the fragment", () => {
    expect(cleanUrl("https://www.Example.com/p/123?utm_source=x&color=red&fbclid=abc&gclid=1#reviews")).toBe(
      "https://www.example.com/p/123?color=red",
    );
  });

  it("removes the Amazon affiliate and tracking parameters", () => {
    expect(cleanUrl("https://www.amazon.fr/dp/B0C1?tag=aff-21&ref=sr_1&psc=1&pd_rd_w=x")).toBe(
      "https://www.amazon.fr/dp/B0C1",
    );
  });

  it("refuses what is not an http(s) link", () => {
    for (const url of ["javascript:alert(1)", "data:text/html,x", "file:///etc/passwd", "not a url", ""]) {
      expect(cleanUrl(url)).toBeNull();
    }
  });

  it("refuses credentials in the URL", () => {
    expect(cleanUrl("https://user:pass@example.com/")).toBeNull();
  });
});

describe("parseQuickAdd", () => {
  it("takes a bare URL, with the site as the waiting title", () => {
    expect(parseQuickAdd(" https://www.fnac.com/a123?utm_medium=mail ")).toEqual({
      title: "fnac.com",
      url: "https://www.fnac.com/a123",
    });
  });

  it("takes free text", () => {
    expect(parseQuickAdd("  Un pull   bleu, taille M ")).toEqual({
      title: "Un pull bleu, taille M",
      url: null,
    });
  });

  it("takes text with a URL in it, as shared from a phone", () => {
    expect(parseQuickAdd("Regarde ce livre https://example.com/livre")).toEqual({
      title: "Regarde ce livre",
      url: "https://example.com/livre",
    });
  });

  it("keeps an unsafe link out but the text in", () => {
    expect(parseQuickAdd("Cadeau javascript:alert(1)")).toEqual({
      title: "Cadeau javascript:alert(1)",
      url: null,
    });
  });

  it("ignores blank input", () => {
    expect(parseQuickAdd("   ")).toBeNull();
  });

  it("caps the title", () => {
    expect(parseQuickAdd("x".repeat(1000))?.title).toHaveLength(MAX_TITLE_LENGTH);
  });
});

describe("diffWish", () => {
  const before: EditableWish = {
    title: "Pull",
    url: null,
    notes: null,
    priceCents: 4000,
    targetCents: null,
    quantity: null,
    kind: "unique",
    repeatable: false,
  };

  it("lists only the fields that change", () => {
    expect(diffWish(before, { title: "Pull bleu", priceCents: 4000 })).toEqual({
      title: { from: "Pull", to: "Pull bleu" },
    });
  });

  it("sees a price change, and a field cleared", () => {
    expect(diffWish(before, { priceCents: null, repeatable: true })).toEqual({
      priceCents: { from: 4000, to: null },
      repeatable: { from: false, to: true },
    });
  });

  it("is empty when nothing changes", () => {
    expect(diffWish(before, {})).toEqual({});
  });
});
