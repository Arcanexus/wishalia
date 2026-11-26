/** Drag and drop of a list's items, as pure functions (the page does the pointer work). */

/** The ids with one of them moved to a new place (clamped to the list). */
export function moveId(ids: readonly string[], id: string, to: number): string[] {
  const rest = ids.filter((other) => other !== id);
  if (rest.length === ids.length) return [...ids];
  const at = Math.min(rest.length, Math.max(0, to));
  return [...rest.slice(0, at), id, ...rest.slice(at)];
}

/** Where a dragged item lands: after every other item whose middle is above the pointer. */
export function dropIndex(middles: readonly number[], y: number): number {
  return middles.filter((middle) => middle < y).length;
}

/**
 * The ids in the order on screen: the order being saved, with the items it does not know yet (a
 * wish just added, on this device or another) in front, where a new wish lands, and without the
 * ones that left meanwhile (deleted, received, archived).
 */
export function shownOrder(order: readonly string[], ids: readonly string[]): string[] {
  const known = new Set(ids);
  const kept = order.filter((id) => known.has(id));
  const planned = new Set(kept);
  return [...ids.filter((id) => !planned.has(id)), ...kept];
}

/** What sending an order gave: taken, refused because the list changed, or no answer. */
export type OrderAnswer = "saved" | "changed" | "failed";

export interface OrderQueue {
  /** Saves the order on screen: now, or right after the save under way, whichever comes first. */
  request(): Promise<void>;
  /** True while an order is being sent or waits to be. */
  readonly busy: boolean;
}

/**
 * Saving a list's order while the person keeps moving items (docs/management-app.md, « Order »).
 * One save at a time, and only the latest order: moves made during a save go together right after
 * it, so an answer never brings back an order the screen has already left. Each save sends the
 * order on screen at that moment (`current`), never the one of the click that asked for it. A
 * refusal because the list changed meanwhile (an item deleted or added on the way) loads the list
 * again and sends the order once more, on top of it. `done` runs once nothing is left to send,
 * after the list was loaded again: the page then shows the server's order.
 */
export function createOrderQueue({
  current,
  send,
  reload,
  done,
  retries = 1,
}: {
  current: () => readonly string[] | null;
  send: (ids: readonly string[]) => Promise<OrderAnswer>;
  reload: () => Promise<unknown>;
  /** With the last answer: "saved", or what went wrong. */
  done: (answer: OrderAnswer) => void;
  retries?: number;
}): OrderQueue {
  let running: Promise<void> | null = null;
  let again = false;

  const loop = async () => {
    let answer: OrderAnswer = "saved";
    let left = retries;
    do {
      again = false;
      const ids = current();
      if (!ids) break;
      answer = await send(ids).catch((): OrderAnswer => "failed");
      if (answer === "changed" && left > 0) {
        left -= 1;
        await reload().catch(() => undefined);
        again = true;
      }
    } while (again);
    await reload().catch(() => undefined);
    // A move made during that last load: one more round
    if (again) return loop();
    done(answer);
  };

  return {
    request() {
      if (running) {
        again = true;
        return running;
      }
      running = loop().finally(() => {
        running = null;
      });
      return running;
    },
    get busy() {
      return running !== null;
    },
  };
}
