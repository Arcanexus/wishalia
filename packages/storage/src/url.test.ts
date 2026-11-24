import { describe, expect, it } from "vitest";

import { withoutTrailingSlashes } from "./url.js";

describe("withoutTrailingSlashes", () => {
  it("drops every trailing slash and keeps the rest", () => {
    expect(withoutTrailingSlashes("http://imgproxy:8080///")).toBe("http://imgproxy:8080");
    expect(withoutTrailingSlashes("http://s3/a/b")).toBe("http://s3/a/b");
    expect(withoutTrailingSlashes("///")).toBe("");
    expect(withoutTrailingSlashes("/".repeat(100_000) + "x" + "/".repeat(100_000))).toHaveLength(100_001);
  });
});
