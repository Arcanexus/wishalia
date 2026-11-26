import { describe, expect, it } from "vitest";

import {
  isLive,
  LIVE_FAST_FOR_MS,
  LIVE_FAST_MS,
  LIVE_SLOW_MS,
  LIVE_STOP_AFTER_MS,
  liveChanges,
  nextLiveDelay,
  stageOf,
  type LiveItem,
} from "./live.js";

describe("the stage of an item", () => {
  it("names each step of the worker", () => {
    expect(stageOf("pending", null)).toBe("reading");
    expect(stageOf("running", null)).toBe("reading");
    expect(stageOf("running", "images")).toBe("images");
    // A step left over from an older run means nothing once the item waits again
    expect(stageOf("pending", "images")).toBe("reading");
    expect(stageOf("failed", null)).toBe("failed");
    expect(stageOf("done", "images")).toBeNull();
    expect(stageOf(null, null)).toBeNull();
  });

  it("keeps asking only while the worker is on it", () => {
    expect(isLive("reading")).toBe(true);
    expect(isLive("images")).toBe(true);
    expect(isLive("failed")).toBe(false);
    expect(isLive(null)).toBe(false);
  });
});

describe("how often the page asks", () => {
  it("asks quickly first, then slower, then stops", () => {
    expect(nextLiveDelay(0)).toBe(LIVE_FAST_MS);
    expect(nextLiveDelay(LIVE_FAST_FOR_MS - 1)).toBe(LIVE_FAST_MS);
    expect(nextLiveDelay(LIVE_FAST_FOR_MS)).toBe(LIVE_SLOW_MS);
    expect(nextLiveDelay(LIVE_STOP_AFTER_MS - 1)).toBe(LIVE_SLOW_MS);
    expect(nextLiveDelay(LIVE_STOP_AFTER_MS)).toBeNull();
  });
});

describe("what a screen reader is told", () => {
  const item = (values: Partial<LiveItem> = {}): LiveItem => ({
    id: "a",
    title: "amazon.fr",
    priceCents: null,
    stage: "reading",
    image: null,
    ...values,
  });

  it("says the details, then the image, then that it is done", () => {
    const words = item({ title: "Lampe", priceCents: 4990, stage: "images" });
    expect(liveChanges([item()], [words])).toEqual([{ id: "a", title: "Lampe", kind: "details" }]);
    const picture = { ...words, image: "/img/1" };
    expect(liveChanges([words], [picture])).toEqual([{ id: "a", title: "Lampe", kind: "image" }]);
    expect(liveChanges([picture], [{ ...picture, stage: null }])).toEqual([
      { id: "a", title: "Lampe", kind: "done" },
    ]);
  });

  it("says once that a link cannot be read, and only the most telling change", () => {
    expect(liveChanges([item()], [item({ stage: "failed" })])).toEqual([
      { id: "a", title: "amazon.fr", kind: "failed" },
    ]);
    expect(liveChanges([item({ stage: "failed" })], [item({ stage: "failed" })])).toEqual([]);
    // Everything at once: the end is what counts
    expect(liveChanges([item()], [item({ title: "Lampe", image: "/img/1", stage: null })])).toEqual([
      { id: "a", title: "Lampe", kind: "done" },
    ]);
  });

  it("stays quiet for items that appear, disappear, lose their image or did not change", () => {
    expect(liveChanges([], [item()])).toEqual([]);
    expect(liveChanges([item()], [])).toEqual([]);
    expect(liveChanges([item({ image: "/img/1" })], [item()])).toEqual([]);
    expect(liveChanges([item({ stage: null })], [item({ stage: null })])).toEqual([]);
  });
});
