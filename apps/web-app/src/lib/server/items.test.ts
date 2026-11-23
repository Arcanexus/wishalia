import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../../test/event.ts";
import { quickAdd, setItemStatus } from "./items.ts";

const ITEM = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a11";
const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

afterEach(() => vi.unstubAllGlobals());

describe("quickAdd", () => {
  it("adds through the API, into the given list, and flags a link already there", async () => {
    const api = fakeApi({
      "POST /manage/items": () =>
        json({ id: ITEM, title: "Une lampe", listId: LIST, duplicateOf: ["other"] }, 201),
    });
    const { event } = fakeEvent({ form: { input: "  https://x.test/lampe " }, cookie: "s=1" });
    expect(await quickAdd(event, LIST)).toEqual({
      add: { item: { id: ITEM, title: "Une lampe", listId: LIST }, duplicate: true },
    });
    expect(api.calls[0]?.body).toEqual({ input: "https://x.test/lampe", listId: LIST });
    expect(api.calls[0]?.headers.get("cookie")).toBe("s=1");
  });

  it("goes to the first list without one", async () => {
    const api = fakeApi({
      "POST /manage/items": () => json({ id: ITEM, title: "x", listId: LIST, duplicateOf: [] }, 201),
    });
    const { event } = fakeEvent({ form: { input: "x" } });
    expect(await quickAdd(event)).toMatchObject({ add: { duplicate: false } });
    expect(api.calls[0]?.body).toEqual({ input: "x" });
  });

  it("refuses an empty field without calling the API, and keeps what was typed on an error", async () => {
    const api = fakeApi({ "POST /manage/items": () => json({ error: "not_found" }, 404) });
    expect(await quickAdd(fakeEvent({ form: { input: "  " } }).event)).toMatchObject({
      status: 400,
      data: { add: { error: "empty" } },
    });
    expect(api.calls).toHaveLength(0);
    expect(await quickAdd(fakeEvent({ form: { input: "lampe" } }).event, LIST)).toMatchObject({
      status: 404,
      data: { add: { error: "not_found", input: "lampe" } },
    });
  });

  it("sends a signed-out person to the sign-in page", async () => {
    fakeApi({ "POST /manage/items": () => json({ error: "unauthenticated" }, 401) });
    const { event } = fakeEvent({ url: "https://app.test/listes/1", form: { input: "x" } });
    expect((await outcome(() => quickAdd(event))).thrown).toMatchObject({
      status: 303,
      location: "/connexion?retour=%2Flistes%2F1",
    });
  });
});

describe("setItemStatus", () => {
  it("changes the status of an item", async () => {
    const api = fakeApi({
      [`PATCH /manage/items/${ITEM}`]: (body) => json({ id: ITEM, title: "x", ...(body as object) }),
    });
    const { event } = fakeEvent({ form: { itemId: ITEM, status: "received" } });
    expect(await setItemStatus(event)).toEqual({ status: { itemId: ITEM, title: "x", status: "received" } });
    expect(api.calls[0]?.body).toEqual({ status: "received" });
  });

  it("refuses anything but an item id and a known status", async () => {
    const api = fakeApi({});
    for (const form of [
      { itemId: "../lists", status: "received" },
      { itemId: ITEM, status: "deleted" },
    ]) {
      expect(await setItemStatus(fakeEvent({ form }).event)).toMatchObject({ status: 400 });
    }
    expect(api.calls).toHaveLength(0);
  });

  it("passes the API's refusal on", async () => {
    fakeApi({});
    const { event } = fakeEvent({ form: { itemId: ITEM, status: "archived" } });
    expect(await setItemStatus(event)).toMatchObject({
      status: 404,
      data: { status: { error: "not_found" } },
    });
  });
});
