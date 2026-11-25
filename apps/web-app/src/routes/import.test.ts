import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../test/event.ts";
import { actions, load } from "./(app)/importer/+page.server.ts";

const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

afterEach(() => vi.unstubAllGlobals());

const run = (handler: unknown, event: unknown) =>
  outcome(() => (handler as (event: unknown) => unknown)(event));

const preview = (items: unknown[], extra: object = {}) => ({
  source: "csv",
  listName: null,
  items,
  skipped: [],
  ...extra,
});
const wish = (title: string) => ({ title, url: null, notes: null, priceCents: null, quantity: null });

function multipart(fields: Record<string, string | File>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

describe("the import page", () => {
  it("loads the lists to import into", async () => {
    fakeApi({ "GET /manage/lists": () => json([{ id: LIST, name: "Noël" }]) });
    expect((await run(load, fakeEvent().event)).value).toEqual({ lists: [{ id: LIST, name: "Noël" }] });
  });
});

describe("reading a source", () => {
  it("reads a Wishlistr address through the API", async () => {
    const api = fakeApi({
      "POST /manage/imports/preview": () => json(preview([wish("Puzzle")], { source: "wishlistr" })),
    });
    const { value } = await run(
      actions.read,
      fakeEvent({ formData: multipart({ how: "lien", address: "wishlistr.com/alex" }) }).event,
    );
    expect(api.calls[0]?.body).toEqual({ source: "wishlistr", address: "wishlistr.com/alex" });
    expect(value).toMatchObject({
      read: {
        preview: { items: [{ title: "Puzzle" }] },
        payload: '[{"title":"Puzzle","url":null,"notes":null,"priceCents":null,"quantity":null}]',
      },
    });
  });

  it("sends a file to the importer its name and content call for", async () => {
    const api = fakeApi({ "POST /manage/imports/preview": () => json(preview([])) });
    await run(
      actions.read,
      fakeEvent({
        formData: multipart({ how: "fichier", file: new File(['[{"name":"x"}]'], "export.json") }),
      }).event,
    );
    await run(
      actions.read,
      fakeEvent({ formData: multipart({ how: "fichier", file: new File(["Titre;Prix\nx;1"], "liste.csv") }) })
        .event,
    );
    await run(actions.read, fakeEvent({ formData: multipart({ how: "texte", text: "Pull\nBonnet" }) }).event);
    expect(api.calls.map((call) => (call.body as { source: string }).source)).toEqual([
      "json",
      "csv",
      "text",
    ]);
  });

  it("refuses what is missing or too large, before calling the API", async () => {
    const api = fakeApi({});
    const cases: [Record<string, string | File>, number, string][] = [
      [{ how: "lien", address: " " }, 400, "empty_address"],
      [{ how: "fichier" }, 400, "empty_file"],
      [{ how: "fichier", file: new File([], "vide.csv") }, 400, "empty_file"],
      [{ how: "fichier", file: new File(["x".repeat(1_000_001)], "gros.csv") }, 413, "too_large"],
      [{ how: "texte", text: "  " }, 400, "empty"],
      [{ how: "texte", text: "é".repeat(600_000) }, 413, "too_large"],
      [{ how: "autre" }, 400, "invalid_request"],
    ];
    for (const [fields, status, error] of cases) {
      const { value } = await run(actions.read, fakeEvent({ formData: multipart(fields) }).event);
      expect(value, error).toMatchObject({ status, data: { read: { error } } });
    }
    expect(api.calls).toHaveLength(0);
  });

  it("gives the API's reason, and keeps what was typed", async () => {
    fakeApi({ "POST /manage/imports/preview": () => json({ error: "invalid_address" }, 422) });
    const { value } = await run(
      actions.read,
      fakeEvent({ formData: multipart({ how: "lien", address: "https://evil.example/x" }) }).event,
    );
    expect(value).toMatchObject({
      status: 422,
      data: { read: { error: "invalid_address", how: "lien", address: "https://evil.example/x" } },
    });
  });

  it("lets other failures through", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("down");
    });
    const { thrown } = await run(
      actions.read,
      fakeEvent({ formData: multipart({ how: "texte", text: "x" }) }).event,
    );
    expect(thrown).toBeInstanceOf(TypeError);
  });
});

describe("adding the wishes kept", () => {
  const payload = JSON.stringify([wish("A"), wish("B"), wish("C")]);

  it("adds the ticked ones to a new list, then opens it", async () => {
    const api = fakeApi({
      "POST /manage/imports": () => json({ listId: LIST, added: 2, duplicates: 1, skipped: 0 }, 201),
    });
    const form = new URLSearchParams({ source: "csv", payload, listId: "nouvelle", listName: "Importée" });
    form.append("pick", "0");
    form.append("pick", "2");
    const { event } = fakeEvent({ url: "https://app.test/importer" });
    const request = new Request("https://app.test/importer", { method: "POST", body: form });
    const { thrown } = await run(actions.commit, { ...event, request });
    expect(api.calls[0]?.body).toEqual({
      source: "csv",
      listName: "Importée",
      items: [wish("A"), wish("C")],
    });
    expect(thrown).toMatchObject({ status: 303, location: `/listes/${LIST}?importees=2&doublons=1` });
  });

  it("adds to an existing list", async () => {
    const api = fakeApi({
      "POST /manage/imports": () => json({ listId: LIST, added: 1, duplicates: 0, skipped: 0 }, 201),
    });
    const { thrown } = await run(
      actions.commit,
      fakeEvent({ form: { source: "text", payload, listId: LIST, pick: "1" } }).event,
    );
    expect(api.calls[0]?.body).toEqual({ source: "text", listId: LIST, items: [wish("B")] });
    expect(thrown).toMatchObject({ location: `/listes/${LIST}?importees=1` });
  });

  it("shows the same preview again when it refuses, with the choices kept", async () => {
    fakeApi({});
    const { value } = await run(
      actions.commit,
      fakeEvent({ form: { source: "csv", payload, listId: "nouvelle", listName: "", pick: "0" } }).event,
    );
    expect(value).toMatchObject({
      status: 400,
      data: {
        commit: { error: "invalid_name", unpicked: [1, 2] },
        read: { preview: { items: [{}, {}, {}] }, payload },
      },
    });
    const none = await run(
      actions.commit,
      fakeEvent({ form: { source: "csv", payload, listId: LIST } }).event,
    );
    expect(none.value).toMatchObject({ data: { commit: { error: "nothing_picked" } } });
    const target = await run(
      actions.commit,
      fakeEvent({ form: { source: "csv", payload, listId: "x", pick: "0" } }).event,
    );
    expect(target.value).toMatchObject({ data: { commit: { error: "invalid_request" } } });
  });

  it("refuses a form that was not built by the page", async () => {
    fakeApi({});
    for (const form of [
      { source: "pdf", payload, listId: LIST, pick: "0" },
      { source: "csv", payload: "{", listId: LIST, pick: "0" },
      { source: "csv", payload: '{"a":1}', listId: LIST, pick: "0" },
    ]) {
      expect((await run(actions.commit, fakeEvent({ form }).event)).value).toMatchObject({
        status: 400,
        data: { commit: { error: "invalid_request" } },
      });
    }
  });

  it("gives the API's reason", async () => {
    fakeApi({ "POST /manage/imports": () => json({ error: "not_found" }, 404) });
    const { value } = await run(
      actions.commit,
      fakeEvent({ form: { source: "csv", payload, listId: LIST, pick: "0" } }).event,
    );
    expect(value).toMatchObject({ status: 404, data: { commit: { error: "not_found" } } });
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("down");
    });
    const failed = await run(
      actions.commit,
      fakeEvent({ form: { source: "csv", payload, listId: LIST, pick: "0" } }).event,
    );
    expect(failed.thrown).toBeInstanceOf(TypeError);
  });
});
