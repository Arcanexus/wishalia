import { deserialize } from "$app/forms";
import { invalidateAll } from "$app/navigation";

import {
  answerOf,
  createOutbox,
  STORAGE_KEY,
  type Answer,
  type Change,
  type NewChange,
  type Outbox,
  type OutboxState,
} from "./outbox.ts";

/**
 * The app's one outbox (#lib/outbox.ts), shared by every page of the tab: it lives as long as the
 * tab, so moving from one page to another never stops a change on its way. The pages read
 * `changes.state` to show the result of a change before the server has it.
 */
let outbox: Outbox | null = null;
const state = $state<OutboxState>({ changes: [], waiting: false, signedOut: false, refused: [] });

async function send(change: Change): Promise<Answer> {
  const body = new FormData();
  for (const [name, value] of change.fields) body.append(name, value);
  let response: Response;
  try {
    response = await fetch(`${change.path}?/${change.action}`, {
      method: "POST",
      body,
      headers: { accept: "application/json", "x-sveltekit-action": "true" },
      cache: "no-store",
    });
  } catch {
    return "again";
  }
  if (response.status === 401) return "signedOut";
  try {
    const result = deserialize(await response.text());
    // The session ended: the action sends to the sign-in page (#lib/server/api.ts)
    if (result.type === "redirect" && result.location.startsWith("/connexion")) return "signedOut";
    const status = result.type === "failure" || result.type === "error" ? result.status : response.status;
    return answerOf(change, result.type, status ?? response.status);
  } catch {
    // Not a form action's answer (a proxy's error page): again later
    return answerOf(change, "error", response.ok ? 502 : response.status);
  }
}

function storage(): Storage | null {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

/** Starts the outbox once, in the browser, with the changes kept from an earlier visit. */
function start(): Outbox {
  if (outbox) return outbox;
  const locks = globalThis.navigator?.locks;
  outbox = createOutbox({
    send,
    reload: () => invalidateAll(),
    onState: (next) => void Object.assign(state, next),
    store: storage(),
    ...(locks ? { lock: (task: () => Promise<void>) => locks.request(STORAGE_KEY, task) } : {}),
  });
  const current = outbox;
  globalThis.addEventListener?.("online", () => current.wake());
  globalThis.addEventListener?.("storage", (event) => {
    if (event.key === STORAGE_KEY) current.sync();
  });
  globalThis.document?.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") current.wake();
  });
  current.sync();
  return current;
}

export const changes = {
  state,
  start,
  add: (change: NewChange) => start().add(change),
  wake: () => start().wake(),
  dismiss: () => start().dismiss(),
};
