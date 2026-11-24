import { describe, expect, it } from "vitest";

import { MAX_TITLE_LENGTH } from "./items.js";
import { MAX_SHARED_LENGTH, sharedInput } from "./share.js";

describe("sharedInput", () => {
  it("takes Chrome's share: the page title, and the link in the text", () => {
    expect(
      sharedInput({
        title: "Lampe de chevet en laiton",
        text: "https://shop.example/lampe?utm_source=share",
      }),
    ).toBe("Lampe de chevet en laiton https://shop.example/lampe");
  });

  it("prefers the url field to a link in the text", () => {
    expect(
      sharedInput({
        title: "Livre de cuisine",
        text: "Vu https://other.example/x",
        url: "https://books.example/42",
      }),
    ).toBe("Livre de cuisine https://books.example/42");
  });

  it("takes the product name from a shop's text when the title is only the shop", () => {
    expect(
      sharedInput({ title: "Amazon.fr", text: "Casque audio sans fil, noir : https://amzn.example/d/abc" }),
    ).toBe("Casque audio sans fil, noir https://amzn.example/d/abc");
  });

  it("keeps a link alone, for the enrichment to find the title", () => {
    expect(sharedInput({ text: "https://www.example.com/p/1" })).toBe("https://www.example.com/p/1");
    expect(sharedInput({ url: "https://www.example.com/p/1" })).toBe("https://www.example.com/p/1");
  });

  it("finds a link in the title when it is the only place", () => {
    expect(sharedInput({ title: "https://example.com/a" })).toBe("https://example.com/a");
  });

  it("keeps words without a link", () => {
    expect(sharedInput({ text: "  Un  pull\n en laine  " })).toBe("Un pull en laine");
  });

  it("never keeps a link that could run code", () => {
    expect(sharedInput({ url: "javascript:alert(1)", text: "Rien" })).toBe("Rien");
    expect(sharedInput({ text: "https://user:pass@example.com/ et https://ok.example/" })).toBe(
      "et https://ok.example/",
    );
  });

  it("is empty when nothing was shared", () => {
    expect(sharedInput({})).toBe("");
    expect(sharedInput({ title: null, text: "   ", url: "" })).toBe("");
  });

  it("caps the words and what it reads of each field", () => {
    const long = "a".repeat(MAX_SHARED_LENGTH * 2);
    const input = sharedInput({ text: `${long} https://example.com/` });
    expect(input).toBe(`${"a".repeat(MAX_TITLE_LENGTH)}`);
    expect(sharedInput({ title: "b".repeat(1000), url: "https://example.com/" })).toBe(
      `${"b".repeat(MAX_TITLE_LENGTH)} https://example.com/`,
    );
  });
});
