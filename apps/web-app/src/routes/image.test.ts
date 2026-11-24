import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../test/event.ts";
import { actions, load } from "./(app)/listes/[id]/image/[itemId]/+page.server.ts";

const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ITEM = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a11";

afterEach(() => vi.unstubAllGlobals());

const run = (handler: unknown, event: unknown) =>
  outcome(() => (handler as (event: unknown) => unknown)(event));
const images = { imageId: null, crop: null, images: [] };

describe("the image page of an item", () => {
  it("loads the item and its images, in the colours of its list", async () => {
    fakeApi({
      [`GET /manage/items/${ITEM}`]: () => json({ id: ITEM, listId: LIST, title: "Lampe" }),
      [`GET /manage/items/${ITEM}/images`]: () => json(images),
      "GET /manage/lists": () => json([{ id: LIST, theme: "christmas" }]),
    });
    const { event } = fakeEvent({ params: { id: LIST, itemId: ITEM } });
    expect((await run(load, event)).value).toEqual({
      item: { id: ITEM, listId: LIST, title: "Lampe" },
      images,
    });
    expect(event.locals.listTheme).toBe("christmas");
  });

  it("answers 404 for an item of another list, or one that is not there", async () => {
    fakeApi({
      [`GET /manage/items/${ITEM}`]: () => json({ id: ITEM, listId: "other", title: "Lampe" }),
      [`GET /manage/items/${ITEM}/images`]: () => json(images),
      "GET /manage/lists": () => json([]),
    });
    expect((await run(load, fakeEvent({ params: { id: LIST, itemId: ITEM } }).event)).thrown).toMatchObject({
      status: 404,
    });
    fakeApi({});
    expect((await run(load, fakeEvent({ params: { id: LIST, itemId: ITEM } }).event)).thrown).toMatchObject({
      status: 404,
    });
    fakeApi({ [`GET /manage/items/${ITEM}`]: () => json({ error: "internal" }, 500) });
    expect((await run(load, fakeEvent({ params: { id: LIST, itemId: ITEM } }).event)).thrown).toMatchObject({
      status: 500,
    });
  });

  it("has its four actions", async () => {
    const api = fakeApi({ [`PATCH /manage/items/${ITEM}/image`]: () => json({ id: ITEM }) });
    const event = (form: Record<string, string>) =>
      fakeEvent({ form, params: { id: LIST, itemId: ITEM } }).event;
    expect((await run(actions.remove, event({}))).value).toEqual({ image: { done: "removed" } });
    expect((await run(actions.crop, event({ whole: "1" }))).value).toEqual({ image: { done: "whole" } });
    expect((await run(actions.choose, event({ imageId: LIST }))).value).toEqual({
      image: { done: "chosen" },
    });
    expect((await run(actions.upload, event({}))).value).toMatchObject({ status: 400 });
    expect(api.calls).toHaveLength(3);
  });
});
