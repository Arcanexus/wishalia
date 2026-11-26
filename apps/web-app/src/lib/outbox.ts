/**
 * The changes made on a list, saved in the background (docs/management-app.md, « Saved in the
 * background »). A tap shows its result at once; the change waits here and goes to the server
 * behind it, one at a time and in the order they were made, so two changes never overtake each
 * other. Moving to another page does not stop it, and neither does a lost network or a server
 * restarting: the change waits and goes again, sooner when the network comes back. The changes are
 * kept in the browser (localStorage), so that closing the tab or reloading loses none of them, and
 * the tabs of one browser share them: a lock lets only one send at a time.
 *
 * Only what the page's own form actions take is kept: ids, a status, an order, a title for the
 * messages. Never a contribution: the owner's page has none (anti-spoil).
 */

/** One change, as its form action takes it. */
export interface Change {
  id: string;
  /** What the screen shows meanwhile. */
  kind: "delete" | "status" | "order" | "moveVolume";
  /** The page whose form action takes it (/listes/<id>). */
  path: string;
  /** The form action's name (?/deleteItem). */
  action: string;
  fields: [string, string][];
  /** A later change with the same key replaces this one while it waits (the latest order wins). */
  key?: string;
  listId: string;
  itemId?: string;
  /** For the messages: what the change is about. */
  title?: string;
  status?: string;
  order?: string[];
  /** How many times it was sent without an answer. */
  tries: number;
}

export type NewChange = Omit<Change, "id" | "tries">;

/** What sending a change gave. */
export type Answer = "done" | "again" | "refused" | "signedOut";

/** Seconds before trying again after the n-th try without an answer: 1, 2, 4… up to 30. */
export function retryDelay(tries: number): number {
  return Math.min(30_000, 1000 * 2 ** Math.max(0, tries - 1));
}

/**
 * What an answer from a SvelteKit form action means here. A lost network, a timeout, a server
 * busy or restarting (5xx): again later. Signed out: kept for after signing in. A deletion that
 * finds nothing left: done (another tab, or an earlier try, did it). Any other refusal: the change
 * cannot be made, the screen goes back to what the server has.
 */
export function answerOf(change: Pick<Change, "kind">, type: string, status: number): Answer {
  if (type === "success" || type === "redirect") return "done";
  if (status === 401) return "signedOut";
  if (status === 404 && change.kind === "delete") return "done";
  if (status === 408 || status === 425 || status === 429 || status >= 500) return "again";
  return "refused";
}

export const STORAGE_KEY = "wishalia.outbox";
const MAX_KEPT = 500;

export interface KeptStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/** Reads the kept changes; anything unreadable is dropped rather than sent. */
export function readKept(store: KeptStore | null): Change[] {
  try {
    const raw = store?.getItem(STORAGE_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (change): change is Change =>
        typeof change === "object" &&
        change !== null &&
        typeof change.id === "string" &&
        typeof change.path === "string" &&
        change.path.startsWith("/") &&
        !change.path.startsWith("//") &&
        typeof change.action === "string" &&
        /^[A-Za-z]+$/.test(change.action) &&
        Array.isArray(change.fields),
    );
  } catch {
    return [];
  }
}

export function writeKept(store: KeptStore | null, changes: readonly Change[]) {
  try {
    store?.setItem(STORAGE_KEY, JSON.stringify(changes.slice(-MAX_KEPT)));
  } catch {
    // Private mode or a full storage: the changes still go, they are only not kept
  }
}

export interface OutboxState {
  /** Waiting or on their way, oldest first; with the ones sent, until the page has their result. */
  changes: Change[];
  /** True while the network or the server does not answer (the changes wait). */
  waiting: boolean;
  /** Signed out: the changes wait for the next sign-in. */
  signedOut: boolean;
  /** The changes the server refused, for the message. */
  refused: Change[];
}

export interface OutboxOptions {
  send: (change: Change) => Promise<Answer>;
  /** Loads the pages' data again, once everything waiting is sent. */
  reload: () => Promise<unknown>;
  onState: (state: OutboxState) => void;
  store?: KeptStore | null;
  /** Runs `task` while holding the browser-wide lock (navigator.locks), or at once. */
  lock?: (task: () => Promise<void>) => Promise<void>;
  newId?: () => string;
  setTimeout?: (run: () => void, ms: number) => unknown;
  clearTimeout?: (timer: unknown) => void;
}

export interface Outbox {
  add(change: NewChange): void;
  /** Sends now what waits (the network is back, the tab is shown, « Try again »). */
  wake(): void;
  /** Another tab changed the kept changes. */
  sync(): void;
  /** Forgets the refused changes once their message is read. */
  dismiss(): void;
  /** Resolves once nothing is left to send. */
  idle(): Promise<void>;
}

export function createOutbox(options: OutboxOptions): Outbox {
  const {
    send,
    reload,
    onState,
    store = null,
    lock = (task) => task(),
    newId = () => crypto.randomUUID(),
    setTimeout: later = (run, ms) => globalThis.setTimeout(run, ms),
    clearTimeout: cancel = (timer) => globalThis.clearTimeout(timer as ReturnType<typeof setTimeout>),
  } = options;
  // Sent, waiting for the reload that shows their result: still shown as they will be
  let settling: Change[] = [];
  let state: OutboxState = { changes: readKept(store), waiting: false, signedOut: false, refused: [] };
  let running: Promise<void> | null = null;
  let timer: unknown = null;
  const idlers: (() => void)[] = [];

  const kept = () => (store ? readKept(store) : state.changes);
  /** What the screen shows: the sent ones still settling, then the kept ones. */
  const shown = () => {
    const waiting = kept();
    const ids = new Set(waiting.map((change) => change.id));
    return [...settling.filter((change) => !ids.has(change.id)), ...waiting];
  };
  const publish = (next: Partial<OutboxState>) => {
    state = { ...state, ...next };
    onState({ ...state, changes: shown() });
  };
  const keep = (changes: Change[]) => {
    if (store) writeKept(store, changes);
    state = { ...state, changes };
  };

  const loop = async () => {
    for (;;) {
      let answer: Answer | null = null;
      let sent: Change | undefined;
      await lock(async () => {
        // Another tab may have sent it meanwhile: the kept list is read again under the lock
        sent = kept()[0];
        if (!sent) return;
        answer = await send(sent).catch((): Answer => "again");
        const rest = kept().filter((change) => change.id !== sent?.id);
        if (answer === "again") {
          keep([{ ...sent, tries: sent.tries + 1 }, ...rest]);
        } else if (answer !== "signedOut") {
          keep(rest);
        }
      });
      if (!sent || !answer) break;
      const current: Change = sent;
      if (answer === "done") {
        settling = [...settling, current];
        publish({ waiting: false, signedOut: false });
        continue;
      }
      if (answer === "refused") {
        publish({ refused: [...state.refused, current], waiting: false });
        continue;
      }
      if (answer === "signedOut") {
        publish({ signedOut: true, waiting: false });
        return;
      }
      // No answer: wait, then go again (sooner when the network comes back)
      publish({ waiting: true });
      const delay = retryDelay(current.tries + 1);
      await new Promise<void>((resume) => {
        timer = later(() => {
          timer = null;
          resume();
        }, delay);
        wakeUp = () => {
          if (timer) cancel(timer);
          timer = null;
          resume();
        };
      });
      wakeUp = null;
    }
    // Everything is sent: the pages load what the server now has, then show it as it is
    await reload().catch(() => undefined);
    if (kept().length > 0) return loop();
    settling = [];
    publish({ waiting: false });
    for (const resolve of idlers.splice(0)) resolve();
  };
  let wakeUp: (() => void) | null = null;

  const start = () => {
    if (running) return;
    running = loop().finally(() => {
      running = null;
      // A change added during the last reload
      if (kept().length > 0 && !state.signedOut) start();
    });
  };

  // Changes kept from an earlier visit go first
  if (kept().length > 0) queueMicrotask(start);

  return {
    add(change) {
      const fresh: Change = { ...change, id: newId(), tries: 0 };
      const list = kept();
      // The same key waiting (not the one on its way, the first): the latest replaces it
      const replaced = change.key
        ? list.filter((other, index) => !(other.key === change.key && (index > 0 || !running)))
        : list;
      keep([...replaced, fresh]);
      publish({});
      start();
    },
    wake() {
      if (state.signedOut) publish({ signedOut: false });
      if (wakeUp) wakeUp();
      else start();
    },
    sync() {
      publish({});
      if (kept().length > 0) start();
    },
    dismiss() {
      publish({ refused: [] });
    },
    idle() {
      if (!running && kept().length === 0) return Promise.resolve();
      return new Promise((resolve) => idlers.push(resolve));
    },
  };
}
