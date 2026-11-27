import { describe, expect, it, vi } from "vitest";

import type { NewChange } from "./outbox.ts";
import { createUndo, UNDO_MS, type Held } from "./undo.ts";

const deletion = (itemId: string): NewChange => ({
  kind: "delete",
  path: "/listes/l",
  action: "deleteItem",
  fields: [["itemId", itemId]],
  listId: "l",
  itemId,
  title: itemId,
});

function setup() {
  let clock = 0;
  const timers = new Map<number, { run: () => void; at: number }>();
  let next = 1;
  const committed: NewChange[] = [];
  const states: (Held | null)[] = [];
  const undo = createUndo({
    commit: (change) => committed.push(change),
    onState: (held) => states.push(held),
    now: () => clock,
    setTimeout: (run, ms) => {
      timers.set(next, { run, at: clock + ms });
      return next++;
    },
    clearTimeout: (timer) => timers.delete(timer as number),
  });
  const advance = (ms: number) => {
    clock += ms;
    for (const [id, timer] of [...timers]) {
      if (timer.at <= clock) {
        timers.delete(id);
        timer.run();
      }
    }
  };
  return { undo, committed, states, advance, timers };
}

describe("undo after a deletion", () => {
  it("holds the deletion back, then hands it to the outbox", () => {
    const { undo, committed, states, advance } = setup();
    undo.hold(deletion("a"));
    expect(states.at(-1)).toMatchObject({ change: { itemId: "a" }, at: UNDO_MS });
    advance(UNDO_MS - 1);
    expect(committed).toEqual([]);
    advance(1);
    expect(committed.map((change) => change.itemId)).toEqual(["a"]);
    expect(states.at(-1)).toBeNull();
  });

  it("drops it on « Annuler », with nothing sent", () => {
    const { undo, committed, advance } = setup();
    undo.hold(deletion("a"));
    expect(undo.undo()?.itemId).toBe("a");
    advance(UNDO_MS * 2);
    expect(committed).toEqual([]);
    expect(undo.undo()).toBeNull();
  });

  it("sends the one held when another comes, and on leaving the page", () => {
    const { undo, committed } = setup();
    undo.hold(deletion("a"));
    undo.hold(deletion("b"));
    expect(committed.map((change) => change.itemId)).toEqual(["a"]);
    undo.flush();
    expect(committed.map((change) => change.itemId)).toEqual(["a", "b"]);
    undo.flush();
    expect(committed).toHaveLength(2);
  });

  it("stops the time while the message is pointed at or focused, then gives it again in full", () => {
    const { undo, committed, advance } = setup();
    undo.hold(deletion("a"));
    advance(UNDO_MS - 100);
    undo.pause();
    advance(UNDO_MS * 3);
    expect(committed).toEqual([]);
    undo.resume();
    advance(UNDO_MS - 1);
    expect(committed).toEqual([]);
    advance(1);
    expect(committed).toHaveLength(1);
    // Resuming with nothing paused does nothing
    undo.resume();
    expect(committed).toHaveLength(1);
  });

  it("works with the real clock by default", () => {
    vi.useFakeTimers();
    const committed: NewChange[] = [];
    const undo = createUndo({ commit: (change) => committed.push(change), onState: () => {} });
    undo.hold(deletion("a"));
    vi.advanceTimersByTime(UNDO_MS);
    expect(committed).toHaveLength(1);
    vi.useRealTimers();
  });
});
