import { describe, expect, it } from "vitest";

import { itemStage } from "./stage.ts";

describe("the step an item shows", () => {
  it("reads the API's words", () => {
    expect(itemStage({ enrichment: "pending", enrichmentStep: "images" })).toBe("images");
    expect(itemStage({ enrichment: "pending", enrichmentStep: null })).toBe("reading");
    expect(itemStage({ enrichment: "pending" })).toBe("reading");
    expect(itemStage({ enrichment: "failed" })).toBe("failed");
    expect(itemStage({ enrichment: "done", enrichmentStep: null })).toBeNull();
    expect(itemStage({})).toBeNull();
  });
});
