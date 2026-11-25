import { describe, expect, it } from "vitest";

import { genericMeta } from "./meta";

describe("genericMeta", () => {
  it("only depends on the name of the product and the reader's language", () => {
    expect(genericMeta("Chut", "fr")).toEqual({
      title: "Chut · une liste de souhaits",
      description: "Une liste de souhaits partagée avec vous.",
      "og:title": "Chut · une liste de souhaits",
      "og:description": "Une liste de souhaits partagée avec vous.",
      "og:type": "website",
    });
    expect(genericMeta("Chut", "en")).toMatchObject({
      title: "Chut · a wishlist",
      description: "A wishlist shared with you.",
    });
  });

  it("takes nothing but the product name and the language, so it cannot reflect the state of a list", () => {
    expect(genericMeta.length).toBe(2);
  });
});
