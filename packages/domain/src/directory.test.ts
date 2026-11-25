import { describe, expect, it } from "vitest";

import {
  giverNameShown,
  matchesSearch,
  MAX_SEARCH_LENGTH,
  normalizeSearch,
  searchWords,
} from "./directory.js";

describe("normalizeSearch", () => {
  it("drops accents, case, punctuation and extra spaces", () => {
    expect(normalizeSearch("  Léa   MARTIN ")).toBe("lea martin");
    expect(normalizeSearch("Noël, l'anniversaire !")).toBe("noel l anniversaire");
    expect(normalizeSearch("Ça")).toBe("ca");
  });
});

describe("searchWords", () => {
  it("refuses a search too short once cleaned", () => {
    expect(searchWords("")).toBeNull();
    expect(searchWords(" é ")).toBeNull();
    expect(searchWords("!!")).toBeNull();
  });

  it("splits a search into its words", () => {
    expect(searchWords("Léa  noël")).toEqual(["lea", "noel"]);
  });

  it("drops what is past the longest search", () => {
    const words = searchWords(`${"a".repeat(MAX_SEARCH_LENGTH)}bbbb`);
    expect(words).toEqual(["a".repeat(MAX_SEARCH_LENGTH)]);
  });
});

describe("matchesSearch", () => {
  const fields = ["Léa Martin", "Noël 2026"];

  it("matches the start of any word, without accents", () => {
    expect(matchesSearch(["lea"], fields)).toBe(true);
    expect(matchesSearch(["mar", "noe"], fields)).toBe(true);
    expect(matchesSearch(["2026"], fields)).toBe(true);
  });

  it("needs every word", () => {
    expect(matchesSearch(["lea", "paul"], fields)).toBe(false);
  });

  it("does not match inside a word", () => {
    expect(matchesSearch(["artin"], fields)).toBe(false);
  });
});

describe("giverNameShown", () => {
  it("names the giver on a personal link, unless discreet", () => {
    expect(giverNameShown({ openLink: false, anonymous: false, mine: false, name: "Paul" })).toBe("Paul");
    expect(giverNameShown({ openLink: false, anonymous: true, mine: false, name: "Paul" })).toBeNull();
  });

  it("names nobody else on an open link", () => {
    expect(giverNameShown({ openLink: true, anonymous: false, mine: false, name: "Paul" })).toBeNull();
    expect(giverNameShown({ openLink: true, anonymous: false, mine: true, name: "Paul" })).toBe("Paul");
    expect(giverNameShown({ openLink: true, anonymous: true, mine: true, name: "Paul" })).toBeNull();
  });
});
