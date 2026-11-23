import { describe, expect, it } from "vitest";

import { createRateLimiter } from "./rate-limit.js";

describe("createRateLimiter", () => {
  it("lets N requests a minute through per key, then refuses until the window resets", () => {
    const limiter = createRateLimiter(2);
    const start = new Date("2026-12-01T12:00:00Z");
    expect(limiter.hit("a", start)).toEqual({ allowed: true, remaining: 1, resetSeconds: 60 });
    expect(limiter.hit("a", start).allowed).toBe(true);
    const third = limiter.hit("a", new Date(start.getTime() + 45_000));
    expect(third).toEqual({ allowed: false, remaining: 0, resetSeconds: 15 });
    expect(limiter.hit("b", start).allowed).toBe(true);
    expect(limiter.hit("a", new Date(start.getTime() + 60_000)).allowed).toBe(true);
  });

  it("keeps a bounded memory", () => {
    const limiter = createRateLimiter(1);
    const now = new Date("2026-12-01T12:00:00Z");
    for (let index = 0; index < 10_001; index += 1) limiter.hit(`key-${index}`, now);
    // The table was cleared once full: the first key starts over
    expect(limiter.hit("key-0", now).allowed).toBe(true);
  });
});
