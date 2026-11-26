import { LIVE_FAST_MS, LIVE_SLOW_MS, LIVE_STOP_AFTER_MS } from "@wishalia/domain";
import { describe, expect, it, vi } from "vitest";

import { followLive, holding, type LiveAnswer } from "./live.ts";

/** A clock, timers and a page the test drives by hand. */
function harness(answers: (LiveAnswer | number | Error)[]) {
  let clock = 0;
  const timers: { at: number; run: () => void }[] = [];
  const listeners = new Set<() => void>();
  const page = {
    visibilityState: "visible" as DocumentVisibilityState,
    addEventListener: (_: string, run: () => void) => listeners.add(run),
    removeEventListener: (_: string, run: () => void) => listeners.delete(run),
  };
  const asked: string[] = [];
  const fetch = vi.fn(async (url: string) => {
    asked.push(url);
    const next = answers.shift() ?? { version: "same", live: 1 };
    if (next instanceof Error) throw next;
    if (typeof next === "number") return new Response("{}", { status: next });
    return new Response(JSON.stringify(next), { status: 200 });
  });
  const reload = vi.fn(async () => {});
  let allowed = true;
  const follower = followLive({
    url: "/listes/1/suivi",
    reload,
    canReload: () => allowed,
    fetch: fetch as unknown as typeof globalThis.fetch,
    now: () => clock,
    setTimeout: (run, ms) => {
      const timer = { at: clock + ms, run };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      const index = timers.indexOf(timer as (typeof timers)[number]);
      if (index >= 0) timers.splice(index, 1);
    },
    document: page as unknown as Document,
  });
  const settle = () => new Promise((done) => setTimeout(done, 0));
  return {
    asked,
    reload,
    follower,
    page,
    listeners,
    timers,
    hold: (value: boolean) => (allowed = !value),
    /** Moves the clock to the next timer and runs it. */
    async next() {
      await settle();
      const timer = timers.shift();
      if (!timer) return false;
      clock = timer.at;
      timer.run();
      await settle();
      return true;
    },
    settle,
    get clock() {
      return clock;
    },
  };
}

describe("following the worker live", () => {
  it("asks at once, reloads only when the version moves, and stops once nothing is left", async () => {
    const h = harness([
      { version: "a", live: 2 },
      { version: "a", live: 2 },
      { version: "b", live: 1 },
      { version: "c", live: 0 },
    ]);
    await h.settle();
    expect(h.asked).toEqual(["/listes/1/suivi"]);
    expect(h.timers[0]?.at).toBe(LIVE_FAST_MS);
    await h.next();
    expect(h.reload).not.toHaveBeenCalled();
    await h.next();
    expect(h.reload).toHaveBeenCalledTimes(1);
    await h.next();
    expect(h.reload).toHaveBeenCalledTimes(2);
    expect(h.timers).toEqual([]);
    expect(h.listeners.size).toBe(0);
  });

  it("reloads when the page came with items already done", async () => {
    const h = harness([{ version: "a", live: 0 }]);
    await h.settle();
    await h.settle();
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.timers).toEqual([]);
  });

  it("waits while a reload would get in the way, then takes the same change", async () => {
    const h = harness([
      { version: "a", live: 1 },
      { version: "b", live: 1 },
      { version: "b", live: 1 },
    ]);
    await h.settle();
    h.hold(true);
    await h.next();
    expect(h.reload).not.toHaveBeenCalled();
    h.hold(false);
    await h.next();
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("never asks with the tab hidden, and asks as soon as it is shown", async () => {
    const h = harness([
      { version: "a", live: 1 },
      { version: "b", live: 1 },
    ]);
    await h.settle();
    h.page.visibilityState = "hidden";
    await h.next();
    expect(h.asked).toHaveLength(1);
    // Hidden, it plans nothing more: the tab costs nothing in the background
    expect(h.timers).toEqual([]);
    h.page.visibilityState = "visible";
    for (const wake of h.listeners) wake();
    await h.settle();
    await h.settle();
    expect(h.asked).toHaveLength(2);
    expect(h.reload).toHaveBeenCalledTimes(1);
  });

  it("goes slower after a while, then stops asking", async () => {
    const h = harness([]);
    await h.settle();
    let last = 0;
    while (h.clock < LIVE_STOP_AFTER_MS && (await h.next())) last = h.clock;
    expect(last).toBeGreaterThanOrEqual(LIVE_STOP_AFTER_MS - LIVE_SLOW_MS);
    expect(h.timers).toEqual([]);
    expect(h.asked.length).toBeLessThan(120);
  });

  it("lives through a network failure or a server error, and gives up when signed out", async () => {
    const h = harness([new Error("offline"), 502, 401]);
    await h.settle();
    await h.next();
    expect(h.reload).not.toHaveBeenCalled();
    await h.next();
    expect(h.reload).toHaveBeenCalledTimes(1);
    expect(h.timers).toEqual([]);
  });

  it("can be stopped by the page", async () => {
    const h = harness([{ version: "a", live: 1 }]);
    await h.settle();
    h.follower.stop();
    expect(h.timers).toEqual([]);
    expect(await h.next()).toBe(false);
  });
});

describe("holding the reloads", () => {
  it("holds while the focus is in a marked form only", () => {
    const inside = { closest: (selector: string) => (selector === "[data-live-hold]" ? {} : null) };
    const outside = { closest: () => null };
    expect(holding({ activeElement: inside as unknown as Element })).toBe(true);
    expect(holding({ activeElement: outside as unknown as Element })).toBe(false);
    expect(holding({ activeElement: null })).toBe(false);
    expect(holding(undefined)).toBe(false);
  });
});
