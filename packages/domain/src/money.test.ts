import { describe, expect, it } from "vitest";

import { cents, formatAmount, parseAmount, sum } from "./money.js";

describe("cents", () => {
  it("accepts safe integers", () => {
    expect(cents(1250)).toBe(1250);
    expect(cents(0)).toBe(0);
    expect(cents(-300)).toBe(-300);
  });

  it.each([1.5, Number.NaN, Number.POSITIVE_INFINITY, Number.MAX_SAFE_INTEGER + 1])("rejects %s", (value) => {
    expect(() => cents(value)).toThrow(RangeError);
  });
});

describe("parseAmount", () => {
  it.each([
    ["12", 1200],
    ["12.5", 1250],
    ["12,50", 1250],
    ["0,05", 5],
    [" 1 250,00 ", 125000],
    ["-3", -300],
  ])("parses %j as %i cents", (text, expected) => {
    expect(parseAmount(text)).toBe(expected);
  });

  it.each(["", "abc", "12.345", "1,2,3", "12€", "--1"])("returns null for %j", (text) => {
    expect(parseAmount(text)).toBeNull();
  });

  it("returns null when the amount does not fit a safe integer", () => {
    expect(parseAmount("9".repeat(20))).toBeNull();
  });
});

describe("sum", () => {
  it("adds amounts without floating point errors", () => {
    expect(sum([cents(10), cents(20)])).toBe(30);
    expect(sum([])).toBe(0);
  });
});

describe("formatAmount", () => {
  it("formats in euros, the French way, by default", () => {
    expect(formatAmount(cents(125050)).replace(/\s/g, " ")).toBe("1 250,50 €");
  });

  it("follows the locale and the currency", () => {
    expect(formatAmount(cents(999), "en-US", "USD")).toBe("$9.99");
  });
});
