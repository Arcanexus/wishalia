import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../../test/event.ts";
import {
  editItem,
  gatherVolumes,
  moveItem,
  moveVolume,
  takeOutVolume,
  ungroupSeries,
  orderItems,
  quickAdd,
  refreshItem,
  refreshList,
  setItemStatus,
} from "./items.ts";

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
      [{ kind: "bundle" }, "invalid_request"],
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

describe("reading links again", () => {
  it("reads one item's link again", async () => {
    const api = fakeApi({
      [`POST /manage/items/${ITEM}/refresh`]: () =>
        json({ id: ITEM, title: "Une lampe", enrichment: "pending" }),
    });
    expect(await refreshItem(fakeEvent({ form: { itemId: ITEM } }).event)).toEqual({
      refresh: { itemId: ITEM, title: "Une lampe" },
    });
    expect(api.calls).toHaveLength(1);
  });

  it("refuses an id that is not one, and says when the API refuses", async () => {
    const api = fakeApi({
      [`POST /manage/items/${ITEM}/refresh`]: () => json({ error: "rate_limited" }, 429),
    });
    expect(await refreshItem(fakeEvent({ form: { itemId: "../x" } }).event)).toMatchObject({
      status: 400,
      data: { refresh: { error: "invalid_request" } },
    });
    expect(api.calls).toHaveLength(0);
    expect(await refreshItem(fakeEvent({ form: { itemId: ITEM } }).event)).toMatchObject({
      status: 429,
      data: { refresh: { error: "rate_limited", itemId: ITEM } },
    });
  });

  it("reads a whole list again, and says when the API refuses", async () => {
    fakeApi({ [`POST /manage/lists/${LIST}/refresh`]: () => json({ queued: 4 }) });
    expect(await refreshList(fakeEvent({ form: {} }).event, LIST)).toEqual({ refresh: { queued: 4 } });
    fakeApi({ [`POST /manage/lists/${LIST}/refresh`]: () => json({ error: "rate_limited" }, 429) });
    expect(await refreshList(fakeEvent({ form: {} }).event, LIST)).toMatchObject({
      status: 429,
      data: { refresh: { error: "rate_limited" } },
    });
  });

  it("lets an unexpected failure through", async () => {
    vi.stubGlobal("fetch", () => Promise.reject(new Error("down")));
    await expect(refreshItem(fakeEvent({ form: { itemId: ITEM } }).event)).rejects.toThrow("down");
    await expect(refreshList(fakeEvent({ form: {} }).event, LIST)).rejects.toThrow("down");
  });
});

describe("series (docs/series.md)", () => {
  const SERIES = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
  const OTHER = "16fd2706-8baf-433b-82eb-8c7fada847da";
  const values = { title: "Dragon Ball", url: "", price: "", notes: "Glénat", kind: "series", listId: LIST };

  it("adds a volume into its series, and keeps what was typed on an error", async () => {
    const api = fakeApi({
      "POST /manage/items": () => json({ id: ITEM, title: "T35", listId: LIST, duplicateOf: [] }, 201),
    });
    expect(await quickAdd(fakeEvent({ form: { input: "T35", parentId: SERIES } }).event, LIST)).toEqual({
      volume: { seriesId: SERIES, title: "T35" },
    });
    expect(api.calls[0]?.body).toEqual({ input: "T35", parentId: SERIES });
    expect(await quickAdd(fakeEvent({ form: { input: "T35", parentId: "x" } }).event)).toMatchObject({
      status: 400,
    });
    expect(await quickAdd(fakeEvent({ form: { input: " ", parentId: SERIES } }).event)).toMatchObject({
      data: { add: { error: "empty", parentId: SERIES } },
    });
    fakeApi({ "POST /manage/items": () => json({ error: "not_found" }, 404) });
    expect(await quickAdd(fakeEvent({ form: { input: "T35", parentId: SERIES } }).event)).toMatchObject({
      status: 404,
      data: { add: { error: "not_found", input: "T35", parentId: SERIES } },
    });
  });

  it("saves a series' name, notes and list only", async () => {
    const api = fakeApi({
      [`PATCH /manage/items/${SERIES}`]: () => json({ id: SERIES, title: "Dragon Ball", listId: LIST }),
    });
    const form = { ...values, itemId: SERIES, series: "1" };
    expect(await editItem(fakeEvent({ form }).event)).toEqual({
      edit: { itemId: SERIES, title: "Dragon Ball", listId: LIST },
    });
    expect(api.calls[0]?.body).toEqual({ title: "Dragon Ball", notes: "Glénat", listId: LIST });
  });

  it("turns a wish into the first volume of a new series", async () => {
    const api = fakeApi({
      [`GET /manage/items/${ITEM}`]: () => json({ id: ITEM, title: "Dragon Ball T30", listId: LIST }),
      [`POST /manage/lists/${LIST}/series`]: () => json({ id: SERIES, kind: "series" }, 201),
    });
    expect(await editItem(fakeEvent({ form: { ...values, itemId: ITEM } }).event)).toEqual({
      edit: { itemId: ITEM, title: "Dragon Ball T30", listId: LIST, seriesId: SERIES },
    });
    expect(api.calls[1]?.body).toEqual({ itemIds: [ITEM] });
    fakeApi({});
    expect(await editItem(fakeEvent({ form: { ...values, itemId: ITEM } }).event)).toMatchObject({
      status: 400,
      data: { edit: { error: "not_found" } },
    });
  });

  it("puts the wishes ticked into a series", async () => {
    const api = fakeApi({ [`POST /manage/items/${SERIES}/volumes`]: () => json({ added: 2 }) });
    const ticked = () => {
      const data = new FormData();
      data.set("seriesId", SERIES);
      data.set("title", "Dragon Ball");
      data.append("itemIds", ITEM);
      data.append("itemIds", OTHER);
      return data;
    };
    expect(await gatherVolumes(fakeEvent({ formData: ticked() }).event)).toEqual({
      series: { seriesId: SERIES, gathered: 2, title: "Dragon Ball" },
    });
    expect(api.calls[0]?.body).toEqual({ itemIds: [ITEM, OTHER] });
    expect(await gatherVolumes(fakeEvent({ form: { seriesId: SERIES, title: "x" } }).event)).toEqual({
      series: { seriesId: SERIES, gathered: 0, title: "x" },
    });
    expect(await gatherVolumes(fakeEvent({ form: { seriesId: "x" } }).event)).toMatchObject({ status: 400 });
    fakeApi({ [`POST /manage/items/${SERIES}/volumes`]: () => json({ error: "is_series" }, 409) });
    expect(await gatherVolumes(fakeEvent({ formData: ticked() }).event)).toMatchObject({
      status: 409,
      data: { series: { error: "is_series" } },
    });
  });

  it("takes a volume out, and undoes a series", async () => {
    fakeApi({
      [`PATCH /manage/items/${ITEM}`]: (body) => json({ id: ITEM, title: "T30", ...(body as object) }),
      [`POST /manage/items/${SERIES}/ungroup`]: () => new Response(null, { status: 204 }),
    });
    expect(await takeOutVolume(fakeEvent({ form: { itemId: ITEM } }).event)).toEqual({
      series: { takenOut: "T30" },
    });
    expect(await ungroupSeries(fakeEvent({ form: { itemId: SERIES, title: "Dragon Ball" } }).event)).toEqual({
      series: { ungrouped: "Dragon Ball" },
    });
    expect(await takeOutVolume(fakeEvent({ form: { itemId: "x" } }).event)).toMatchObject({ status: 400 });
    expect(await ungroupSeries(fakeEvent({ form: { itemId: "x" } }).event)).toMatchObject({ status: 400 });
    fakeApi({});
    expect(await ungroupSeries(fakeEvent({ form: { itemId: SERIES } }).event)).toMatchObject({ status: 404 });
  });

  it("moves a volume inside its series, and the list's own wishes without the volumes", async () => {
    const items = [
      { id: SERIES, status: "open", parentId: null, position: 0, title: "Dragon Ball" },
      { id: OTHER, status: "open", parentId: SERIES, position: 0, title: "T30" },
      { id: ITEM, status: "open", parentId: SERIES, position: 1, title: "T31" },
    ];
    const api = fakeApi({
      [`GET /manage/lists/${LIST}/items`]: () => json(items),
      [`PUT /manage/items/${SERIES}/order`]: () => new Response(null, { status: 204 }),
    });
    expect(await moveVolume(fakeEvent({ form: { itemId: ITEM, direction: "up" } }).event, LIST)).toEqual({
      move: { title: "T31", position: 1, count: 2 },
    });
    expect(api.calls[1]?.body).toEqual({ itemIds: [ITEM, OTHER] });
    expect(
      await moveVolume(fakeEvent({ form: { itemId: SERIES, direction: "up" } }).event, LIST),
    ).toMatchObject({
      status: 409,
    });
    expect(
      await moveVolume(fakeEvent({ form: { itemId: ITEM, direction: "left" } }).event, LIST),
    ).toMatchObject({
      status: 400,
    });
    // At the top of the list already, the series does not move, and its volumes are not counted
    expect(await moveItem(fakeEvent({ form: { itemId: SERIES, direction: "up" } }).event, LIST)).toEqual({
      move: { title: "Dragon Ball", position: 1, count: 1 },
    });
  });
});
