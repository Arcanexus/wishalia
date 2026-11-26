import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createSaver, formKey, isTyped, type SaveState } from "./autosave.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function saver(results: (boolean | Error)[] = []) {
  const states: SaveState[] = [];
  const save = vi.fn(async () => {
    const next = results.shift() ?? true;
    if (next instanceof Error) throw next;
    return next;
  });
  return { states, save, saver: createSaver({ save, onState: (state) => states.push(state), delay: 800 }) };
}

describe("createSaver", () => {
  it("waits for a pause in the typing, then saves once", async () => {
    const { states, save, saver: s } = saver();
    s.schedule();
    await vi.advanceTimersByTimeAsync(500);
    s.schedule();
    await vi.advanceTimersByTimeAsync(500);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(300);
    expect(save).toHaveBeenCalledTimes(1);
    expect(states).toEqual(["waiting", "waiting", "saving", "saved"]);
  });

  it("saves a choice at once, and what changed during a save right after it", async () => {
    let finish: (ok: boolean) => void = () => undefined;
    const states: SaveState[] = [];
    const save = vi
      .fn<() => Promise<boolean>>()
      .mockImplementationOnce(() => new Promise((resolve) => (finish = resolve)))
      .mockResolvedValue(true);
    const s = createSaver({ save, onState: (state) => states.push(state) });
    s.schedule(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    s.schedule(0);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
    finish(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe("saved");
  });

  it("says so when the server refuses or cannot be reached, and tries again on the next change", async () => {
    const { states, save, saver: s } = saver([false, new Error("offline"), true]);
    await s.flush();
    expect(states.at(-1)).toBe("error");
    await s.flush();
    expect(states.at(-1)).toBe("error");
    await s.flush();
    expect(states.at(-1)).toBe("saved");
    expect(save).toHaveBeenCalledTimes(3);
  });

  it("sends a waiting change when the form goes away, and nothing when none waits", async () => {
    const { save, saver: s } = saver();
    s.dispose();
    expect(save).not.toHaveBeenCalled();
    s.schedule();
    s.dispose();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("flushes into the save already running instead of starting another", async () => {
    let finish: (ok: boolean) => void = () => undefined;
    const save = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)));
    const s = createSaver({ save, onState: () => undefined });
    const first = s.flush();
    const second = s.flush();
    finish(true);
    await Promise.all([first, second]);
    expect(save).toHaveBeenCalledTimes(1);
  });
});

describe("formKey", () => {
  it("changes only with what the form holds", () => {
    const a = new FormData();
    a.append("title", "Vélo");
    a.append("kind", "unique");
    const b = new FormData();
    b.append("title", "Vélo");
    b.append("kind", "unique");
    expect(formKey(a)).toBe(formKey(b));
    b.set("title", "Vélo rouge");
    expect(formKey(a)).not.toBe(formKey(b));
  });
});

describe("isTyped", () => {
  it("waits for a pause in what is typed, not in what is chosen", () => {
    const field = (tagName: string, type = "") => ({ tagName, type }) as unknown as EventTarget;
    expect(isTyped(field("TEXTAREA"))).toBe(true);
    expect(isTyped(field("INPUT", "text"))).toBe(true);
    expect(isTyped(field("INPUT", "url"))).toBe(true);
    expect(isTyped(field("INPUT", "radio"))).toBe(false);
    expect(isTyped(field("INPUT", "checkbox"))).toBe(false);
    expect(isTyped(field("SELECT"))).toBe(false);
    expect(isTyped(null)).toBe(false);
  });
});

describe("autosave", () => {
  /** A form as the action sees it: its fields, its address, its events. */
  function fakeForm(fields: Record<string, string>) {
    const target = new EventTarget() as EventTarget & { action: string; fields: Record<string, string> };
    target.action = "http://app.test/listes/1?/edit";
    target.fields = fields;
    return target;
  }
  class FakeFormData extends FormData {
    constructor(form?: { fields?: Record<string, string> }) {
      super();
      for (const [name, value] of Object.entries(form?.fields ?? {})) this.append(name, value);
    }
  }
  const answer = (body: object) => Promise.resolve(new Response(JSON.stringify(body)));
  const fire = (form: EventTarget, type: string, field: object) => {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, "target", { value: field });
    form.dispatchEvent(event);
    return event;
  };
  const text = { tagName: "INPUT", type: "text" };
  const radio = { tagName: "INPUT", type: "radio" };

  beforeEach(() => vi.stubGlobal("FormData", FakeFormData));
  afterEach(() => vi.unstubAllGlobals());

  it("sends what changed through the form's action, after a pause or at once for a choice", async () => {
    const { autosave } = await import("./autosave.ts");
    const fetch = vi.fn(() => answer({ type: "success", status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const form = fakeForm({ title: "Vélo" });
    const states: SaveState[] = [];
    const onResult = vi.fn(() => true);
    const action = autosave(form as unknown as HTMLFormElement, { onState: (s) => states.push(s), onResult });

    // Nothing changed: nothing goes
    fire(form, "change", radio);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).not.toHaveBeenCalled();

    form.fields.title = "Vélo rouge";
    fire(form, "input", text);
    await vi.advanceTimersByTimeAsync(900);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0]).toEqual([
      "http://app.test/listes/1?/edit",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-sveltekit-action": "true" }),
      }),
    ]);
    expect(onResult).toHaveBeenCalledWith({ type: "success", status: 200 });
    expect(states.at(-1)).toBe("saved");

    form.fields.kind = "pool";
    fire(form, "change", radio);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    action.destroy();
  });

  it("sends at once on Enter and when a typed field is left, and keeps a refused change to send again", async () => {
    const { autosave } = await import("./autosave.ts");
    const fetch = vi
      .fn()
      .mockImplementationOnce(() => answer({ type: "failure", status: 400 }))
      .mockImplementation(() => answer({ type: "success", status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const form = fakeForm({ title: "Vélo" });
    const states: SaveState[] = [];
    const action = autosave(form as unknown as HTMLFormElement, {
      onState: (s) => states.push(s),
      onResult: (result) => result.type === "success",
    });
    form.fields.title = "";
    fire(form, "change", text);
    await vi.advanceTimersByTimeAsync(0);
    expect(states.at(-1)).toBe("error");
    // « Try again » and Enter submit the form: it goes again, not as a page load
    const submit = fire(form, "submit", form);
    expect(submit.defaultPrevented).toBe(true);
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(states.at(-1)).toBe("saved");

    action.update({ onState: () => undefined, onResult: () => true });
    form.fields.title = "Vélo bleu";
    fire(form, "input", text);
    action.destroy();
    await vi.advanceTimersByTimeAsync(0);
    expect(fetch).toHaveBeenCalledTimes(3);
  });
});
