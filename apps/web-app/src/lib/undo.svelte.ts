import { changes } from "./changes.svelte.ts";
import type { NewChange } from "./outbox.ts";
import { createUndo, type Held, type Undo } from "./undo.ts";

/**
 * The tab's one held deletion (#lib/undo.ts), shared by the pages and the message that offers
 * « Annuler » (#lib/UndoToast.svelte): it lives as long as the tab, so moving to another page
 * keeps the message, and leaving the tab sends the deletion.
 */
const state = $state<{ held: Held | null; back: string }>({ held: null, back: "" });
let core: Undo | null = null;

function start(): Undo {
  if (core) return core;
  const current = createUndo({
    commit: (change) => changes.add(change),
    onState: (held) => {
      state.held = held;
    },
  });
  core = current;
  globalThis.addEventListener?.("pagehide", () => current.flush());
  globalThis.document?.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") current.flush();
  });
  return current;
}

export const deletions = {
  state,
  hold: (change: NewChange) => {
    state.back = "";
    start().hold(change);
  },
  /** « Annuler »: the wish comes back; the page says so. */
  undo: (said: (title: string) => string) => {
    const change = start().undo();
    if (change) state.back = said(change.title ?? "");
    return change;
  },
  pause: () => start().pause(),
  resume: () => start().resume(),
};
