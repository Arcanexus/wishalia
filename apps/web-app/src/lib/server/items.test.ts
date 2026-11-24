import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../../test/event.ts";
import { editItem, moveItem, orderItems, quickAdd, setItemStatus } from "./items.ts";

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

  it("takes the list the person picked, and refuses one that is not a list id", async () => {
    const api = fakeApi({
      "POST /manage/items": () => json({ id: ITEM, title: "x", listId: LIST, duplicateOf: [] }, 201),
    });
    await quickAdd(fakeEvent({ form: { input: "x", listId: LIST } }).event);
    expect(api.calls[0]?.body).toEqual({ input: "x", listId: LIST });
    expect(await quickAdd(fakeEvent({ form: { input: "x", listId: "../admin" } }).event)).toMatchObject({
      status: 400,
      data: { add: { error: "invalid_request", input: "x" } },
    });
    expect(api.calls).toHaveLength(1);
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

  it("sends a signed-out person to the sign-in page, with what they shared", async () => {
    fakeApi({ "POST /manage/items": () => json({ error: "unauthenticated" }, 401) });
    const shared = fakeEvent({
      url: "https://app.test/partager?url=https%3A%2F%2Fx.test",
      form: { input: "x" },
    });
    expect((await outcome(() => quickAdd(shared.event))).thrown).toMatchObject({
      location: `/connexion?retour=${encodeURIComponent("/partager?url=https%3A%2F%2Fx.test")}`,
    });
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

describe("editItem", () => {
  const OTHER = "5f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  const base = {
    itemId: ITEM,
    title: " Vélo de ville ",
    url: "https://shop.test/velo?utm_source=x",
    price: "",
    notes: "Plutôt vert",
    kind: "pool",
    quantity: "3",
    target: "320",
    listId: LIST,
  };
  const patched = () =>
    fakeApi({
      [`PATCH /manage/items/${ITEM}`]: (body) =>
        json({ id: ITEM, listId: LIST, ...(body as object), title: (body as { title: string }).title }),
    });

  it("sends the fields of the kind chosen, and only those", async () => {
    const api = patched();
    expect(await editItem(fakeEvent({ form: base }).event)).toEqual({
      edit: { itemId: ITEM, title: "Vélo de ville", listId: LIST },
    });
    expect(api.calls[0]?.body).toEqual({
      title: "Vélo de ville",
      url: "https://shop.test/velo",
      notes: "Plutôt vert",
      priceCents: null,
      kind: "pool",
      quantity: null,
      targetCents: 32000,
      repeatable: false,
      listId: LIST,
    });

    await editItem(
      fakeEvent({ form: { ...base, kind: "quantity", price: "12,50", notes: "", listId: OTHER } }).event,
    );
    expect(api.calls[1]?.body).toMatchObject({
      kind: "quantity",
      quantity: 3,
      targetCents: null,
      priceCents: 1250,
      notes: null,
      listId: OTHER,
    });

    await editItem(
      fakeEvent({ form: { ...base, kind: "unique", repeatable: "on", url: "", target: "" } }).event,
    );
    expect(api.calls[2]?.body).toMatchObject({
      kind: "unique",
      repeatable: true,
      url: null,
      targetCents: null,
    });
  });

  it("takes a pool without a target", async () => {
    const api = patched();
    await editItem(fakeEvent({ form: { ...base, target: "" } }).event);
    expect(api.calls[0]?.body).toMatchObject({ kind: "pool", targetCents: null });
  });

  it("refuses what cannot be right without calling the API, and gives back what was typed", async () => {
    const api = patched();
    const cases: [Record<string, string>, string][] = [
      [{ itemId: "../x" }, "invalid_request"],
      [{ listId: "nope" }, "invalid_request"],
      [{ kind: "series" }, "invalid_request"],
      [{ title: "  " }, "invalid_title"],
      [{ title: "x".repeat(301) }, "invalid_title"],
      [{ url: "javascript:alert(1)" }, "invalid_url"],
      [{ notes: "x".repeat(4001) }, "invalid_notes"],
      [{ price: "beaucoup" }, "invalid_price"],
      [{ kind: "quantity", quantity: "0" }, "invalid_quantity"],
      [{ kind: "quantity", quantity: "2.5" }, "invalid_quantity"],
      [{ target: "0" }, "invalid_target"],
      [{ target: "abc" }, "invalid_target"],
    ];
    for (const [patch, error] of cases) {
      const result = await editItem(fakeEvent({ form: { ...base, ...patch } }).event);
      expect(result, error).toMatchObject({ status: 400, data: { edit: { error } } });
    }
    expect(api.calls).toHaveLength(0);
    const kept = await editItem(fakeEvent({ form: { ...base, price: "x" } }).event);
    expect(kept).toMatchObject({ data: { edit: { values: { title: "Vélo de ville", target: "320" } } } });
  });

  it("passes the API's refusal on", async () => {
    fakeApi({ [`PATCH /manage/items/${ITEM}`]: () => json({ error: "not_found" }, 404) });
    expect(await editItem(fakeEvent({ form: base }).event)).toMatchObject({
      status: 404,
      data: { edit: { itemId: ITEM, error: "not_found" } },
    });
  });
});

describe("moving items", () => {
  const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
  const [A, B, C] = ["a", "b", "c"].map((letter) => `0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a1${letter}`) as [
    string,
    string,
    string,
  ];
  const items = () =>
    json([
      { id: A, title: "Un", status: "open" },
      { id: B, title: "Deux", status: "open" },
      { id: C, title: "Trois", status: "open" },
      { id: "x", title: "Reçu", status: "received" },
    ]);
  const saved = () => new Response(null, { status: 204 });

  it("moves an item one place up or down among the open ones, and says where it is", async () => {
    const api = fakeApi({
      [`GET /manage/lists/${LIST}/items`]: items,
      [`PUT /manage/lists/${LIST}/order`]: saved,
    });
    const up = await outcome(() => moveItem(fakeEvent({ form: { itemId: C, direction: "up" } }).event, LIST));
    expect(up.value).toEqual({ move: { title: "Trois", position: 2, count: 3 } });
    expect(api.calls.at(-1)?.body).toEqual({ itemIds: [A, C, B] });

    // Already at the top: nothing to save
    const top = await outcome(() =>
      moveItem(fakeEvent({ form: { itemId: A, direction: "up" } }).event, LIST),
    );
    expect(top.value).toEqual({ move: { title: "Un", position: 1, count: 3 } });
    expect(api.calls.filter((call) => call.method === "PUT")).toHaveLength(1);
  });

  it("refuses a wrong request, and says when the list changed meanwhile", async () => {
    fakeApi({ [`GET /manage/lists/${LIST}/items`]: items });
    for (const form of [
      { itemId: "nope", direction: "up" },
      { itemId: A, direction: "left" },
    ]) {
      expect((await outcome(() => moveItem(fakeEvent({ form }).event, LIST))).value).toMatchObject({
        status: 400,
      });
    }
    const gone = await outcome(() =>
      moveItem(
        fakeEvent({ form: { itemId: "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a99", direction: "down" } }).event,
        LIST,
      ),
    );
    expect(gone.value).toMatchObject({ status: 409, data: { move: { error: "order_changed" } } });

    fakeApi({
      [`GET /manage/lists/${LIST}/items`]: items,
      [`PUT /manage/lists/${LIST}/order`]: () => json({ error: "order_changed" }, 409),
    });
    const raced = await outcome(() =>
      moveItem(fakeEvent({ form: { itemId: A, direction: "down" } }).event, LIST),
    );
    expect(raced.value).toMatchObject({ status: 409, data: { move: { error: "order_changed" } } });
  });

  it("saves a whole new order once an item is dropped", async () => {
    const api = fakeApi({ [`PUT /manage/lists/${LIST}/order`]: saved });
    const { event } = fakeEvent({ form: { x: "1" } });
    const body = new URLSearchParams([
      ["itemIds", B],
      ["itemIds", A],
      ["itemIds", C],
    ]);
    event.request = new Request("https://app.test/", { method: "POST", body });
    expect((await outcome(() => orderItems(event, LIST))).value).toEqual({ move: { ordered: true } });
    expect(api.calls[0]?.body).toEqual({ itemIds: [B, A, C] });

    event.request = new Request("https://app.test/", { method: "POST", body: new URLSearchParams() });
    expect((await outcome(() => orderItems(event, LIST))).value).toMatchObject({ status: 400 });
    fakeApi({});
    expect(
      (
        await outcome(() =>
          orderItems(
            {
              ...event,
              request: new Request("https://app.test/", {
                method: "POST",
                body: new URLSearchParams([["itemIds", A]]),
              }),
            },
            LIST,
          ),
        )
      ).value,
    ).toMatchObject({ status: 404 });
  });
});
