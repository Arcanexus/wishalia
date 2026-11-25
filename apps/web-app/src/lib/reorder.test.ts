import { describe, expect, it } from "vitest";

import { dropIndex, moveId } from "./reorder.ts";

describe("reorder", () => {
  it("moves an id, within the list's bounds", () => {
    expect(moveId(["a", "b", "c"], "a", 2)).toEqual(["b", "c", "a"]);
    expect(moveId(["a", "b", "c"], "c", 0)).toEqual(["c", "a", "b"]);
    expect(moveId(["a", "b", "c"], "b", -3)).toEqual(["b", "a", "c"]);
    expect(moveId(["a", "b", "c"], "b", 9)).toEqual(["a", "c", "b"]);
    expect(moveId(["a", "b"], "z", 0)).toEqual(["a", "b"]);
  });

  it("drops after the items whose middle is above the pointer", () => {
    expect(dropIndex([100, 200, 300], 50)).toBe(0);
    expect(dropIndex([100, 200, 300], 250)).toBe(2);
    expect(dropIndex([100, 200, 300], 900)).toBe(3);
  });
});
