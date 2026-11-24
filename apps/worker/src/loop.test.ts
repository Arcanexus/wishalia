import { describe, expect, it, vi } from "vitest";

import * as jobs from "./jobs.js";
import { runLoop } from "./loop.js";

describe("runLoop", () => {
  it("works straight on while there are items, waits when idle or after an error, stops when told", async () => {
    const outcomes = ["done", "idle", "boom", "retry"];
    let turns = 0;
    vi.spyOn(jobs, "enrichNext").mockImplementation(async () => {
      const outcome = outcomes[turns++];
      if (outcome === "boom") throw new Error("database away");
      return outcome as jobs.Outcome;
    });
    const sleep = vi.fn(async () => undefined);
    const observe = vi.fn();
    const log = vi.fn();
    await runLoop({
      db: {} as never,
      fetchPage: async () => ({ url: "", html: "" }),
      metrics: { observe },
      isRunning: () => turns < outcomes.length,
      sleep,
      log,
      idleMs: 10,
    });
    expect(observe.mock.calls.map(([outcome]) => outcome)).toEqual(["done", "retry"]);
    expect(sleep.mock.calls).toEqual([[10], [50]]);
    expect(log).toHaveBeenCalledWith("enrichment loop: database away");
    vi.restoreAllMocks();
  });
});
