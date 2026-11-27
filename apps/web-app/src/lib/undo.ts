import type { NewChange } from "./outbox.ts";

/**
 * « Annuler » after a deletion (docs/management-app.md, « Undo »): the wish leaves the screen at
 * once, but its deletion waits a few seconds before it joins the outbox (#lib/outbox.ts), so that
 * « Annuler » brings it back with nothing sent and no guest told. One deletion waits at a time: the
 * next one sends the first. The time stops while the person points at, or is on, the message
 * (WCAG 2.2.1), and leaving the page sends what waits, so that nothing is lost.
 */

export const UNDO_MS = 8000;

export interface Held {
  change: NewChange;
  /** When it goes, unless the time is stopped. */
  at: number;
}

export interface UndoOptions {
  /** Hands the change over to the outbox. */
  commit: (change: NewChange) => void;
  onState: (held: Held | null) => void;
  delay?: number;
  now?: () => number;
  setTimeout?: (run: () => void, ms: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
}

export interface Undo {
  /** Holds a deletion back; the one held before goes now. */
  hold(change: NewChange): void;
  /** « Annuler »: the held deletion is dropped. Returns it, or null when it already went. */
  undo(): NewChange | null;
  /** Sends the held deletion now (the page is left, the tab hidden). */
  flush(): void;
  /** Stops the time (pointer or focus on the message), and starts it again, in full. */
  pause(): void;
  resume(): void;
}

export function createUndo(options: UndoOptions): Undo {
  const {
    commit,
    onState,
    delay = UNDO_MS,
    now = () => Date.now(),
    setTimeout: later = (run, ms) => globalThis.setTimeout(run, ms),
    clearTimeout: cancel = (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
  } = options;
  let held: Held | null = null;
  let timer: unknown = null;
  let paused = false;

  const stop = () => {
    if (timer !== null) cancel(timer);
    timer = null;
  };
  const arm = () => {
    stop();
    if (!held || paused) return;
    held = { ...held, at: now() + delay };
    timer = later(go, delay);
    onState(held);
  };
  const go = () => {
    stop();
    const change = held?.change;
    held = null;
    paused = false;
    onState(null);
    if (change) commit(change);
  };

  return {
    hold(change) {
      if (held) go();
      held = { change, at: now() + delay };
      paused = false;
      arm();
    },
    undo() {
      stop();
      const change = held?.change ?? null;
      held = null;
      paused = false;
      onState(null);
      return change;
    },
    flush: go,
    pause() {
      paused = true;
      stop();
    },
    resume() {
      if (!paused) return;
      paused = false;
      arm();
    },
  };
}
