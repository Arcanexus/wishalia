import { describe, expect, it } from "vitest";

import { mergedOrder } from "./order.js";

describe("mergedOrder", () => {
  it("takes the order given when it names every open item", () => {
    expect(mergedOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
  });

  it("leaves out what left the list and keeps a new item in front", () => {
    expect(mergedOrder(["c", "gone", "a"], ["new", "a", "c"])).toEqual(["new", "c", "a"]);
    expect(mergedOrder(["gone"], ["a", "b"])).toEqual(["a", "b"]);
  });

  it("refuses an id given twice", () => {
    expect(mergedOrder(["a", "a"], ["a"])).toBeNull();
  });
});
