import { nextLiveDelay } from "@wishalia/domain";

/**
 * Following the worker live (docs/live-updates.md), in the browser of both frontends. While items
 * are completed from their links, the page asks its own server a few-byte question (the list's
 * version and how many items are still on their way) and loads the list again only when the
 * answer changes. Plain HTTP on the page's own origin, with its cookies: nothing held open, nothing
 * new to secure, and it works behind any proxy. It never asks with the tab hidden.
 */

export interface LiveAnswer {
  version: string;
  live: number;
}

export interface LiveOptions {
  /** The page's own endpoint that answers a LiveAnswer. */
  url: string;
  /** Loads the page's data again (SvelteKit's invalidate). */
  reload: () => Promise<unknown> | unknown;
  /** False while a reload would get in the way (an item being dragged, a field being typed in). */
  canReload?: () => boolean;
  fetch?: typeof fetch;
  now?: () => number;
  setTimeout?: (run: () => void, ms: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
  document?: Pick<Document, "visibilityState" | "addEventListener" | "removeEventListener">;
}

export interface Follower {
  stop: () => void;
}

export function followLive(options: LiveOptions): Follower {
  const {
    url,
    reload,
    canReload = () => true,
    fetch: ask = globalThis.fetch.bind(globalThis),
    now = Date.now,
    setTimeout: later = (run, ms) => globalThis.setTimeout(run, ms),
    clearTimeout: cancel = (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
    document: page = globalThis.document,
  } = options;
  const started = now();
  let known: string | null = null;
  let timer: unknown;
  let stopped = false;
  let busy = false;

  const stop = () => {
    stopped = true;
    cancel(timer);
    page?.removeEventListener("visibilitychange", wake);
  };

  const plan = () => {
    if (stopped) return;
    const delay = nextLiveDelay(now() - started);
    if (delay === null) return stop();
    cancel(timer);
    timer = later(() => void tick(), delay);
  };

  async function tick() {
    if (stopped || busy) return;
    // A hidden tab waits: it asks again as soon as it is shown
    if (page?.visibilityState === "hidden") return;
    busy = true;
    try {
      const response = await ask(url, { headers: { accept: "application/json" }, cache: "no-store" });
      if (response.status === 401 || response.status === 404) {
        // Signed out, or the list is gone: the page's own load says so
        stop();
        await reload();
        return;
      }
      if (!response.ok) return;
      const answer = (await response.json()) as LiveAnswer;
      const moved = known !== null && answer.version !== known;
      // The page came with items on their way: once none is left, its data is behind
      const finished = answer.live === 0;
      if ((moved || finished) && !canReload()) return; // the same answer is taken again next time
      known = answer.version;
      if (moved || finished) await reload();
      if (finished) stop();
    } catch {
      // No network for a moment: the next question will tell
    } finally {
      busy = false;
      plan();
    }
  }

  function wake() {
    if (page?.visibilityState === "visible") void tick();
  }

  page?.addEventListener("visibilitychange", wake);
  void tick();
  return { stop };
}

/**
 * Working in a form marked data-live-hold (an item being edited): a reload could replace what is
 * being written, so it waits until the focus leaves it. Elsewhere (the quick add field among
 * others) a reload changes nothing the person is typing.
 */
export function holding(doc: Pick<Document, "activeElement"> | undefined = globalThis.document): boolean {
  return !!doc?.activeElement?.closest("[data-live-hold]");
}
