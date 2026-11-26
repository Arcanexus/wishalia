import { deserialize } from "$app/forms";
import type { ActionResult } from "$app/forms";

/**
 * Settings saved as they change, without a « Save » button (docs/management-app.md, « Saved as you
 * go »). Typing waits for a short pause, a choice (a radio, a box, a select) goes at once, leaving
 * a field or pressing Enter sends what is left. One save at a time: what changes during a save
 * goes right after it. Nothing typed is ever lost: on a refusal or a lost network, the fields keep
 * what was typed and the next change, or « Try again », sends it again.
 */
export type SaveState = "idle" | "waiting" | "saving" | "saved" | "error";

export interface Saver {
  /** Saves after `wait` milliseconds of quiet (0: at once). A new call starts the wait again. */
  schedule(wait?: number): void;
  /** Saves now what waits, and resolves once everything is saved or refused. */
  flush(): Promise<void>;
  /** Stops the wait; a pending change is sent at once, so that leaving the page loses nothing. */
  dispose(): void;
}

export const TYPING_PAUSE = 800;

export function createSaver({
  save,
  onState,
  delay = TYPING_PAUSE,
}: {
  /** Sends the form; true once the server took it. A thrown error counts as a refusal. */
  save: () => Promise<boolean>;
  onState: (state: SaveState) => void;
  delay?: number;
}): Saver {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let running: Promise<void> | null = null;
  let again = false;

  const run = (): Promise<void> => {
    if (timer) clearTimeout(timer);
    timer = null;
    if (running) {
      again = true;
      return running;
    }
    onState("saving");
    running = (async () => {
      const ok = await save().catch(() => false);
      running = null;
      if (again) {
        again = false;
        return run();
      }
      onState(ok ? "saved" : "error");
    })();
    return running;
  };

  return {
    schedule(wait = delay) {
      if (timer) clearTimeout(timer);
      onState(running ? "saving" : "waiting");
      timer = setTimeout(() => void run(), wait);
    },
    flush: () => (timer || !running ? run() : running),
    dispose() {
      if (timer) void run();
    },
  };
}

/** What a form holds, as one string: a save is only sent when it changed. */
export function formKey(data: FormData): string {
  return JSON.stringify([...data.entries()].map(([name, value]) => [name, String(value)]));
}

const TYPED = new Set(["text", "search", "url", "email", "tel", "number", "password", ""]);

/** Whether an input is typed into (a pause before saving) or chosen (saved at once). */
export function isTyped(target: EventTarget | null): boolean {
  const field = target as { tagName?: string; type?: string } | null;
  if (field?.tagName === "TEXTAREA") return true;
  return field?.tagName === "INPUT" && TYPED.has(field.type ?? "");
}

export interface AutosaveOptions {
  onState: (state: SaveState) => void;
  /** What to do with the server's answer; true when it was taken (then the form is « saved »). */
  onResult: (result: ActionResult) => boolean | Promise<boolean>;
  delay?: number;
}

/**
 * The Svelte action that saves a form as it changes, through its own action (`action="?/…"`),
 * the way SvelteKit's enhance posts it. Enter, and the form's own submit, send it at once.
 */
export function autosave(form: HTMLFormElement, options: AutosaveOptions) {
  let current = options;
  let saved = formKey(new FormData(form));
  const saver = createSaver({
    delay: current.delay ?? TYPING_PAUSE,
    onState: (state) => current.onState(state),
    save: async () => {
      const data = new FormData(form);
      const key = formKey(data);
      if (key === saved) return true;
      const response = await fetch(form.action, {
        method: "POST",
        body: data,
        headers: { accept: "application/json", "x-sveltekit-action": "true" },
        cache: "no-store",
      });
      const result: ActionResult = deserialize(await response.text());
      const ok = await current.onResult(result);
      if (ok) saved = key;
      return ok;
    },
  });

  const oninput = (event: Event) => {
    if (isTyped(event.target)) saver.schedule();
  };
  const onchange = (event: Event) => {
    // A typed field's change comes as it is left: what it holds goes now
    if (isTyped(event.target)) void saver.flush();
    else saver.schedule(0);
  };
  const onsubmit = (event: SubmitEvent) => {
    event.preventDefault();
    void saver.flush();
  };
  form.addEventListener("input", oninput);
  form.addEventListener("change", onchange);
  form.addEventListener("submit", onsubmit);
  return {
    update(next: AutosaveOptions) {
      current = next;
    },
    destroy() {
      form.removeEventListener("input", oninput);
      form.removeEventListener("change", onchange);
      form.removeEventListener("submit", onsubmit);
      saver.dispose();
    },
  };
}
