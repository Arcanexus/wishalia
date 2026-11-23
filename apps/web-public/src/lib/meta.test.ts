import { describe, expect, it } from "vitest";

import { genericMeta } from "./meta";

describe("genericMeta", () => {
  it("only depends on the name of the product", () => {
    expect(genericMeta("Chut")).toEqual({
      title: "Chut · une liste de souhaits",
      description: "Une liste de souhaits partagée avec vous.",
      "og:title": "Chut · une liste de souhaits",
      "og:description": "Une liste de souhaits partagée avec vous.",
      "og:type": "website",
    });
  });

  it("takes nothing but the product name, so it cannot reflect the state of a list", () => {
    expect(genericMeta.length).toBe(1);
  });
});
