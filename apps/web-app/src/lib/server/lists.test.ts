import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../../test/event.ts";
import { archiveList, revealList, saveListSettings } from "./lists.ts";

const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

afterEach(() => vi.unstubAllGlobals());

describe("saveListSettings", () => {
  it("saves the name, the forced theme or none, and how the secret lifts", async () => {
    const api = fakeApi({ [`PATCH /manage/lists/${LIST}`]: () => json({ id: LIST }) });
    const form = { name: " Noël 2026 ", theme: "christmas", revealMode: "manual" };
    expect(await saveListSettings(fakeEvent({ form }).event, LIST)).toEqual({ settings: { saved: true } });
    expect(api.calls[0]?.body).toEqual({ name: "Noël 2026", theme: "christmas", revealMode: "manual" });

    // « Celui de chacun » takes the forced theme off; a frozen secret sends no mode
    await saveListSettings(fakeEvent({ form: { name: "x", theme: "none" } }).event, LIST);
    expect(api.calls[1]?.body).toEqual({ name: "x", theme: null });
  });

  it("saves who finds the list, private or public, and ignores anything else", async () => {
    const api = fakeApi({ [`PATCH /manage/lists/${LIST}`]: () => json({ id: LIST }) });
    await saveListSettings(
      fakeEvent({ form: { name: "x", theme: "none", visibility: "public" } }).event,
      LIST,
    );
    expect(api.calls[0]?.body).toEqual({ name: "x", theme: null, visibility: "public" });
    await saveListSettings(
      fakeEvent({ form: { name: "x", theme: "none", visibility: "private" } }).event,
      LIST,
    );
    expect(api.calls[1]?.body).toEqual({ name: "x", theme: null, visibility: "private" });
    await saveListSettings(fakeEvent({ form: { name: "x", theme: "none", visibility: "all" } }).event, LIST);
    expect(api.calls[2]?.body).toEqual({ name: "x", theme: null });
  });

  it("refuses a missing name or an unknown theme without calling the API", async () => {
    const api = fakeApi({});
    for (const [form, error] of [
      [{ name: " ", theme: "none" }, "invalid_name"],
      [{ name: "x".repeat(101), theme: "none" }, "invalid_name"],
      [{ name: "x", theme: "pink" }, "invalid_request"],
    ] as const) {
      expect(await saveListSettings(fakeEvent({ form }).event, LIST)).toMatchObject({
        status: 400,
        data: { settings: { error } },
      });
    }
    expect(
      await saveListSettings(fakeEvent({ form: { name: "x", theme: "none" } }).event, "../x"),
    ).toMatchObject({
      status: 400,
    });
    expect(api.calls).toHaveLength(0);
  });

  it("passes the API's refusal on, with the name typed", async () => {
    fakeApi({ [`PATCH /manage/lists/${LIST}`]: () => json({ error: "secret_already_lifted" }, 409) });
    const form = { name: "Livres", theme: "none", revealMode: "received" };
    expect(await saveListSettings(fakeEvent({ form }).event, LIST)).toMatchObject({
      status: 409,
      data: { settings: { error: "secret_already_lifted", name: "Livres" } },
    });
  });
});

describe("revealList", () => {
  it("lifts the secret only once confirmed", async () => {
    const api = fakeApi({ [`POST /manage/lists/${LIST}/reveal`]: () => json({ id: LIST }) });
    expect(await revealList(fakeEvent({ form: {} }).event, LIST)).toMatchObject({
      status: 400,
      data: { reveal: { error: "confirm" } },
    });
    expect(api.calls).toHaveLength(0);
    expect(await revealList(fakeEvent({ form: { confirm: "oui" } }).event, LIST)).toEqual({
      reveal: { lifted: true },
    });
    expect(await revealList(fakeEvent({ form: { confirm: "oui" } }).event, "nope")).toMatchObject({
      status: 400,
    });
  });

  it("says why it cannot", async () => {
    fakeApi({ [`POST /manage/lists/${LIST}/reveal`]: () => json({ error: "reveal_on_received" }, 409) });
    expect(await revealList(fakeEvent({ form: { confirm: "oui" } }).event, LIST)).toMatchObject({
      status: 409,
      data: { reveal: { error: "reveal_on_received" } },
    });
  });
});

describe("archiveList", () => {
  it("archives once confirmed, then goes back to the lists", async () => {
    const api = fakeApi({ [`PATCH /manage/lists/${LIST}`]: () => json({ id: LIST }) });
    expect(await archiveList(fakeEvent({ form: {} }).event, LIST)).toMatchObject({
      data: { archive: { error: "confirm" } },
    });
    expect(api.calls).toHaveLength(0);
    expect(
      (await outcome(() => archiveList(fakeEvent({ form: { confirm: "oui" } }).event, LIST))).thrown,
    ).toMatchObject({ status: 303, location: "/?archivee=1" });
    expect(api.calls[0]?.body).toEqual({ archived: true });
    expect(await archiveList(fakeEvent({ form: { confirm: "oui" } }).event, "x")).toMatchObject({
      status: 400,
    });
  });

  it("stays on the list when the API refuses", async () => {
    fakeApi({ [`PATCH /manage/lists/${LIST}`]: () => json({ error: "not_found" }, 404) });
    expect(await archiveList(fakeEvent({ form: { confirm: "oui" } }).event, LIST)).toMatchObject({
      status: 404,
      data: { archive: { error: "not_found" } },
    });
  });
});
