import { describe, expect, it, vi } from "vitest";

import {
  answerOf,
  createOutbox,
  readKept,
  retryDelay,
  STORAGE_KEY,
  writeKept,
  type Answer,
  type Change,
  type KeptStore,
  type NewChange,
  type OutboxState,
} from "./outbox.ts";

const flush = async () => {
  for (let i = 0; i < 10; i++) await Promise.resolve();
};

function memory(initial?: string): KeptStore & { data: Map<string, string> } {
  const data = new Map<string, string>(initial ? [[STORAGE_KEY, initial]] : []);
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => void data.set(key, value),
  };
}

const change = (over: Partial<NewChange> = {}): NewChange => ({
  kind: "status",
  path: "/listes/l1",
  action: "status",
  fields: [["itemId", "a"]],
  listId: "l1",
  itemId: "a",
  ...over,
});

/** An outbox whose sends answer when the test says so, and whose timers the test runs. */
function setup(store: KeptStore | null = memory()) {
  const sends: { change: Change; answer: (value: Answer) => void }[] = [];
  const timers: { run: () => void; ms: number }[] = [];
  const states: OutboxState[] = [];
  const reload = vi.fn(async () => undefined);
  let n = 0;
  const outbox = createOutbox({
    send: (sent) => new Promise<Answer>((answer) => sends.push({ change: sent, answer })),
    reload,
    onState: (state) => states.push(state),
    store,
    newId: () => `c${++n}`,
    setTimeout: (run, ms) => {
      const timer = { run, ms };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      const at = timers.indexOf(timer as (typeof timers)[number]);
      if (at >= 0) timers.splice(at, 1);
    },
  });
  const last = () => states.at(-1);
  return { outbox, sends, timers, states, reload, last };
}

describe("answerOf", () => {
  it("tells done, again, signed out and refused apart", () => {
    expect(answerOf({ kind: "status" }, "success", 200)).toBe("done");
    expect(answerOf({ kind: "status" }, "redirect", 303)).toBe("done");
    expect(answerOf({ kind: "status" }, "failure", 401)).toBe("signedOut");
    expect(answerOf({ kind: "delete" }, "failure", 404)).toBe("done");
    expect(answerOf({ kind: "status" }, "failure", 404)).toBe("refused");
    for (const status of [408, 425, 429, 500, 502, 503]) {
      expect(answerOf({ kind: "order" }, "error", status)).toBe("again");
    }
    expect(answerOf({ kind: "order" }, "failure", 400)).toBe("refused");
  });

  it("waits longer each time, 30 seconds at most", () => {
    expect([1, 2, 3, 4, 5, 6, 10].map(retryDelay)).toEqual([1000, 2000, 4000, 8000, 16000, 30000, 30000]);
    expect(retryDelay(0)).toBe(1000);
  });
});

describe("kept changes", () => {
  it("drops anything unreadable or pointing elsewhere", () => {
    const good = { ...change(), id: "x", tries: 0 };
    const store = memory(
      JSON.stringify([
        good,
        { ...good, path: "//evil.example/x" },
        { ...good, path: "https://evil.example" },
        { ...good, action: "a/../b" },
        { ...good, fields: "x" },
        null,
        "text",
      ]),
    );
    expect(readKept(store)).toEqual([good]);
    expect(readKept(memory("{not json"))).toEqual([]);
    expect(readKept(memory('{"a":1}'))).toEqual([]);
    expect(readKept(null)).toEqual([]);
  });

  it("survives a storage that refuses", () => {
    const broken: KeptStore = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("full");
      },
    };
    expect(readKept(broken)).toEqual([]);
    expect(() => writeKept(broken, [])).not.toThrow();
  });
});

describe("createOutbox", () => {
  it("sends one change at a time, in order, then loads the page once", async () => {
    const store = memory();
    const { outbox, sends, reload, last } = setup(store);
    outbox.add(change({ itemId: "a" }));
    outbox.add(change({ itemId: "b", kind: "delete", action: "deleteItem" }));
    await flush();
    // Shown at once, both of them
    expect(last()?.changes.map((one) => one.itemId)).toEqual(["a", "b"]);
    expect(sends).toHaveLength(1);
    // Kept in the browser meanwhile
    expect(readKept(store).map((one) => one.itemId)).toEqual(["a", "b"]);
    sends[0]?.answer("done");
    await flush();
    expect(sends.map((sent) => sent.change.itemId)).toEqual(["a", "b"]);
    expect(reload).not.toHaveBeenCalled();
    // Sent, but still shown until the page has loaded what the server now has
    expect(last()?.changes.map((one) => one.itemId)).toEqual(["a", "b"]);
    sends[1]?.answer("done");
    await outbox.idle();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(last()?.changes).toEqual([]);
    expect(readKept(store)).toEqual([]);
  });

  it("keeps only the latest change of a key while it waits", async () => {
    const { outbox, sends } = setup();
    outbox.add(change({ kind: "order", key: "order:l1", order: ["a", "b"] }));
    await flush();
    // The first is on its way: it stays; the next two wait and the last replaces the other
    outbox.add(change({ kind: "order", key: "order:l1", order: ["b", "a"] }));
    outbox.add(change({ kind: "order", key: "order:l1", order: ["c", "b", "a"] }));
    sends[0]?.answer("done");
    await flush();
    expect(sends.map((sent) => sent.change.order)).toEqual([
      ["a", "b"],
      ["c", "b", "a"],
    ]);
  });

  it("waits and tries again when nothing answers, sooner when the network is back", async () => {
    const store = memory();
    const { outbox, sends, timers, last } = setup(store);
    outbox.add(change());
    await flush();
    sends[0]?.answer("again");
    await flush();
    expect(last()?.waiting).toBe(true);
    expect(timers.map((timer) => timer.ms)).toEqual([1000]);
    expect(readKept(store)[0]?.tries).toBe(1);
    // The timer goes off: sent again
    timers[0]?.run();
    await flush();
    expect(sends).toHaveLength(2);
    sends[1]?.answer("again");
    await flush();
    expect(timers.at(-1)?.ms).toBe(2000);
    // The network is back: at once, without waiting for the timer
    outbox.wake();
    await flush();
    expect(sends).toHaveLength(3);
    sends[2]?.answer("done");
    await outbox.idle();
    expect(last()).toMatchObject({ waiting: false, changes: [] });
  });

  it("counts a send that throws as no answer", async () => {
    const timers: number[] = [];
    let calls = 0;
    const outbox = createOutbox({
      send: () => (++calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve("done")),
      reload: async () => undefined,
      onState: () => undefined,
      setTimeout: (run, ms) => {
        timers.push(ms);
        run();
        return null;
      },
    });
    outbox.add(change());
    await outbox.idle();
    expect(calls).toBe(2);
    expect(timers).toEqual([1000]);
  });

  it("tells a refusal and moves on to the next change", async () => {
    const { outbox, sends, last } = setup();
    outbox.add(change({ itemId: "a", title: "Lampe" }));
    outbox.add(change({ itemId: "b" }));
    await flush();
    sends[0]?.answer("refused");
    await flush();
    sends[1]?.answer("done");
    await outbox.idle();
    expect(last()?.refused.map((one) => one.title)).toEqual(["Lampe"]);
    expect(last()?.changes).toEqual([]);
    outbox.dismiss();
    expect(last()?.refused).toEqual([]);
  });

  it("keeps the changes for after signing in again", async () => {
    const store = memory();
    const { outbox, sends, last } = setup(store);
    outbox.add(change());
    await flush();
    sends[0]?.answer("signedOut");
    await flush();
    expect(last()?.signedOut).toBe(true);
    expect(readKept(store)).toHaveLength(1);
    outbox.wake();
    await flush();
    expect(last()?.signedOut).toBe(false);
    expect(sends).toHaveLength(2);
  });

  it("sends the changes kept from an earlier visit, and follows another tab", async () => {
    const store = memory(JSON.stringify([{ ...change({ itemId: "old" }), id: "k1", tries: 3 }]));
    const { outbox, sends, last } = setup(store);
    await flush();
    expect(sends.map((sent) => sent.change.itemId)).toEqual(["old"]);
    sends[0]?.answer("done");
    await outbox.idle();
    // Another tab adds one: this one shows it and, holding the lock, may send it
    writeKept(store, [{ ...change({ itemId: "other" }), id: "k2", tries: 0 }]);
    outbox.sync();
    await flush();
    expect(last()?.changes.map((one) => one.itemId)).toEqual(["other"]);
    expect(sends.at(-1)?.change.itemId).toBe("other");
  });

  it("works without a storage, and with nothing to send", async () => {
    const { outbox, sends } = setup(null);
    await outbox.idle();
    outbox.sync();
    outbox.wake();
    await flush();
    expect(sends).toHaveLength(0);
    outbox.add(change());
    await flush();
    sends[0]?.answer("done");
    await outbox.idle();
  });

  it("goes round once more for a change made while the page loads again", async () => {
    const ref: { outbox?: ReturnType<typeof createOutbox> } = {};
    let reloads = 0;
    const sent: string[] = [];
    const outbox = createOutbox({
      send: async (one) => {
        sent.push(one.itemId ?? "");
        return "done";
      },
      reload: async () => {
        reloads += 1;
        if (reloads === 1) ref.outbox?.add(change({ itemId: "late" }));
      },
      onState: () => undefined,
    });
    ref.outbox = outbox;
    outbox.add(change({ itemId: "first" }));
    await flush();
    await outbox.idle();
    expect(sent).toEqual(["first", "late"]);
  });
});
