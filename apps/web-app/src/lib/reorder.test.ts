import { describe, expect, it, vi } from "vitest";

import { createOrderQueue, dropIndex, moveId, shownOrder, type OrderAnswer } from "./reorder.ts";

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

describe("shownOrder", () => {
  it("keeps the order on its way, new items in front, gone ones out", () => {
    expect(shownOrder(["c", "a", "b"], ["a", "b", "c"])).toEqual(["c", "a", "b"]);
    expect(shownOrder(["c", "a", "b"], ["n", "a", "b", "c"])).toEqual(["n", "c", "a", "b"]);
    expect(shownOrder(["c", "a", "b"], ["a", "c"])).toEqual(["c", "a"]);
  });
});

/** A send that answers when the test says so. */
function controlled() {
  const calls: { ids: string[]; answer: (value: OrderAnswer) => void }[] = [];
  const send = (ids: readonly string[]) =>
    new Promise<OrderAnswer>((answer) => calls.push({ ids: [...ids], answer }));
  return { calls, send };
}
const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("createOrderQueue", () => {
  it("sends one order at a time, then only the latest, and reloads once at the end", async () => {
    let screen = ["b", "a", "c"];
    const { calls, send } = controlled();
    const reload = vi.fn(async () => undefined);
    const done = vi.fn();
    const queue = createOrderQueue({ current: () => screen, send, reload, done });

    const first = queue.request();
    expect(queue.busy).toBe(true);
    // Two more moves while the first is on its way: they go together, after it
    screen = ["b", "c", "a"];
    void queue.request();
    screen = ["c", "b", "a"];
    void queue.request();
    expect(calls).toHaveLength(1);
    calls[0]?.answer("saved");
    await flush();
    expect(calls.map((call) => call.ids)).toEqual([
      ["b", "a", "c"],
      ["c", "b", "a"],
    ]);
    // No reload in between: it would bring back the first order on screen
    expect(reload).not.toHaveBeenCalled();
    calls[1]?.answer("saved");
    await first;
    expect(reload).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledExactlyOnceWith("saved");
    expect(queue.busy).toBe(false);
  });

  it("loads the list again and sends once more when it changed meanwhile", async () => {
    const answers: OrderAnswer[] = ["changed", "saved"];
    const send = vi.fn(async () => answers.shift() ?? "saved");
    const reload = vi.fn(async () => undefined);
    const done = vi.fn();
    await createOrderQueue({ current: () => ["a"], send, reload, done }).request();
    expect(send).toHaveBeenCalledTimes(2);
    expect(reload).toHaveBeenCalledTimes(2);
    expect(done).toHaveBeenCalledWith("saved");
  });

  it("gives up after the retries, and on a lost network", async () => {
    const done = vi.fn();
    const reload = vi.fn(async () => undefined);
    await createOrderQueue({ current: () => ["a"], send: async () => "changed", reload, done }).request();
    expect(done).toHaveBeenLastCalledWith("changed");
    await createOrderQueue({
      current: () => ["a"],
      send: () => Promise.reject(new Error("offline")),
      reload: () => Promise.reject(new Error("offline")),
      done,
    }).request();
    expect(done).toHaveBeenLastCalledWith("failed");
  });

  it("sends nothing once the screen has no order of its own", async () => {
    const send = vi.fn(async (): Promise<OrderAnswer> => "saved");
    const done = vi.fn();
    await createOrderQueue({ current: () => null, send, reload: async () => undefined, done }).request();
    expect(send).not.toHaveBeenCalled();
    expect(done).toHaveBeenCalledWith("saved");
  });

  it("goes round once more for a move made during the last load", async () => {
    let screen = ["a", "b"];
    const send = vi.fn(async (_ids: readonly string[]): Promise<OrderAnswer> => "saved");
    const done = vi.fn();
    const later: { queue?: ReturnType<typeof createOrderQueue> } = {};
    let reloads = 0;
    const reload = async () => {
      reloads += 1;
      if (reloads === 1) {
        screen = ["b", "a"];
        void later.queue?.request();
      }
    };
    later.queue = createOrderQueue({ current: () => screen, send, reload, done });
    await later.queue.request();
    expect(send.mock.calls.map(([ids]) => ids)).toEqual([
      ["a", "b"],
      ["b", "a"],
    ]);
    expect(done).toHaveBeenCalledTimes(1);
  });
});
