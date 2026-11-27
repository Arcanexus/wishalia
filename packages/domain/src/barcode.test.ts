import { describe, expect, it } from "vitest";

import { readScanned, spacedIsbn, validEan13 } from "./barcode.js";

describe("validEan13", () => {
  it("checks the last digit", () => {
    expect(validEan13("9782070612758")).toBe(true);
    expect(validEan13("9782070612759")).toBe(false);
    expect(validEan13("3017620422003")).toBe(true);
    expect(validEan13("12345")).toBe(false);
    expect(validEan13("97820706127a8")).toBe(false);
  });
});

describe("readScanned", () => {
  it("makes a book's code a link to its page", () => {
    expect(readScanned("978-2-07-061275-8")).toEqual({
      kind: "book",
      isbn: "9782070612758",
      url: "https://openlibrary.org/isbn/9782070612758",
    });
  });

  it("says another product's code back", () => {
    expect(readScanned("3017620422003")).toEqual({ kind: "other", code: "3017620422003" });
    expect(readScanned("12345670")).toEqual({ kind: "other", code: "12345670" });
  });

  it("ignores what is not a product code", () => {
    expect(readScanned("https://example.com")).toBeNull();
    expect(readScanned("")).toBeNull();
  });
});

describe("spacedIsbn", () => {
  it("cuts it in three", () => {
    expect(spacedIsbn("9782070612758")).toBe("978 2070 612758");
  });
});
