import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../test/event.ts";
import { actions, load } from "./(app)/listes/[id]/icone/+page.server.ts";

const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const path = `/manage/lists/${LIST}`;

afterEach(() => vi.unstubAllGlobals());

const run = (handler: unknown, event: unknown) =>
  outcome(() => (handler as (event: unknown) => unknown)(event));
const list = { id: LIST, name: "Noël", theme: "christmas", icon: "tree", image: null };

const withFile = (file?: File, listId = LIST) => {
  const formData = new FormData();
  if (file) formData.set("image", file);
  return fakeEvent({ formData, params: { id: listId } }).event;
};

describe("the picture page of a list", () => {
  it("loads the list, in its own colours", async () => {
    fakeApi({ "GET /manage/lists": () => json([list]) });
    const { event } = fakeEvent({ params: { id: LIST } });
    expect((await run(load, event)).value).toEqual({ list });
    expect(event.locals.listTheme).toBe("christmas");
  });

  it("answers 404 for a list that is not there", async () => {
    fakeApi({ "GET /manage/lists": () => json([]) });
    expect((await run(load, fakeEvent({ params: { id: LIST } }).event)).thrown).toMatchObject({
      status: 404,
    });
  });

  it("shows one of the icons, and nothing else", async () => {
    const api = fakeApi({ [`PATCH ${path}`]: () => json(list) });
    const event = (form: Record<string, string>, id = LIST) => fakeEvent({ form, params: { id } }).event;
    expect((await run(actions.icon, event({ icon: "tree" }))).value).toEqual({ picture: { done: "icon" } });
    expect(api.calls[0]?.body).toEqual({ icon: "tree" });
    for (const icon of ["rocket", "", "../tree"]) {
      expect((await run(actions.icon, event({ icon }))).value).toMatchObject({
        status: 400,
        data: { picture: { error: "invalid_request" } },
      });
    }
    expect((await run(actions.icon, event({ icon: "tree" }, "x"))).value).toMatchObject({ status: 400 });
    expect(api.calls).toHaveLength(1);
    fakeApi({ [`PATCH ${path}`]: () => json({ error: "not_found" }, 404) });
    expect((await run(actions.icon, event({ icon: "tree" }))).value).toMatchObject({
      status: 404,
      data: { picture: { error: "not_found" } },
    });
  });

  it("sends the image's bytes to the API, never what the browser said it is", async () => {
    const api = fakeApi({ [`PUT ${path}/image`]: () => json(list) });
    const file = new File([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], "logo.png", { type: "image/svg+xml" });
    expect((await run(actions.upload, withFile(file))).value).toEqual({ picture: { done: "uploaded" } });
    expect(api.calls[0]?.headers.get("content-type")).toBe("application/octet-stream");
    expect(api.calls[0]?.body).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47]));
  });

  it("refuses no file or a file too heavy without calling the API, and words the API's refusals", async () => {
    const api = fakeApi({ [`PUT ${path}/image`]: () => json({ error: "not_an_image" }, 415) });
    expect((await run(actions.upload, withFile())).value).toMatchObject({
      status: 400,
      data: { picture: { error: "no_file" } },
    });
    const heavy = new File([new Uint8Array(10 * 1024 * 1024 + 1)], "big.jpg");
    expect((await run(actions.upload, withFile(heavy))).value).toMatchObject({
      status: 413,
      data: { picture: { error: "too_heavy" } },
    });
    expect((await run(actions.upload, withFile(heavy, "x"))).value).toMatchObject({ status: 400 });
    expect(api.calls).toHaveLength(0);
    const text = new File(["hello"], "a.png");
    expect((await run(actions.upload, withFile(text))).value).toMatchObject({
      status: 415,
      data: { picture: { error: "not_an_image" } },
    });
    fakeApi({ [`PUT ${path}/image`]: () => json({ error: "FST_ERR_CTP_BODY_TOO_LARGE" }, 413) });
    expect((await run(actions.upload, withFile(text))).value).toMatchObject({
      data: { picture: { error: "too_heavy" } },
    });
    fakeApi({ [`PUT ${path}/image`]: () => json({ error: "images_off" }, 503) });
    expect((await run(actions.upload, withFile(text))).value).toMatchObject({
      data: { picture: { error: "images_off" } },
    });
  });

  it("removes the owner's image", async () => {
    const api = fakeApi({ [`DELETE ${path}/image`]: () => json(list) });
    const event = (id = LIST) => fakeEvent({ form: {}, params: { id } }).event;
    expect((await run(actions.forget, event())).value).toEqual({ picture: { done: "forgotten" } });
    expect(api.calls[0]?.method).toBe("DELETE");
    expect((await run(actions.forget, event("x"))).value).toMatchObject({ status: 400 });
    fakeApi({ [`DELETE ${path}/image`]: () => json({ error: "no_image" }, 404) });
    expect((await run(actions.forget, event())).value).toMatchObject({
      status: 404,
      data: { picture: { error: "no_image" } },
    });
  });

  it("lets a real error through", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const { thrown } = await run(actions.forget, fakeEvent({ form: {}, params: { id: LIST } }).event);
    expect(thrown).toBeInstanceOf(Error);
  });
});
