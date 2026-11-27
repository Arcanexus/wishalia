import { describe, expect, it } from "vitest";

import { headingAnchor, topicUrl } from "./help.ts";

describe("headingAnchor", () => {
  it("makes the anchor GitHub gives a heading", () => {
    expect(headingAnchor("Ajouter une envie")).toBe("ajouter-une-envie");
    expect(headingAnchor("La règle d'or : la surprise")).toBe("la-règle-dor--la-surprise");
    expect(headingAnchor("Giving a gift (for relatives)")).toBe("giving-a-gift-for-relatives");
    expect(headingAnchor("Display, language and app")).toBe("display-language-and-app");
  });
});

describe("topicUrl", () => {
  it("adds the heading's anchor to the guide's address", () => {
    expect(topicUrl("https://example.org/wiki/Guide", "Les séries")).toBe(
      "https://example.org/wiki/Guide#les-s%C3%A9ries",
    );
    expect(topicUrl("https://example.org/aide#old", "Occasions")).toBe("https://example.org/aide#occasions");
  });

  it("keeps an address it cannot read as it is", () => {
    expect(topicUrl("not a url", "Occasions")).toBe("not a url");
  });
});
