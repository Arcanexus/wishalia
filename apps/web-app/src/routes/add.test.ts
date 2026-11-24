import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../test/event.ts";
import { actions, load } from "./(app)/ajouter/+page.server.ts";

const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ITEM = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a11";

afterEach(() => vi.unstubAllGlobals());

const run = (handler: unknown, event: unknown) =>
  outcome(() => (handler as (event: unknown) => unknown)(event));

describe("the page the share menu opens", () => {
  it("fills the field with what was shared, and adds nothing on its own", async () => {
    const api = fakeApi({ "GET /manage/lists": () => json([{ id: LIST, name: "Mes envies" }]) });
    const shared = new URLSearchParams({ title: "Une lampe", text: "https://x.test/lampe?utm_source=a" });
    const { value } = await run(load, fakeEvent({ url: `https://app.test/ajouter?${shared}` }).event);
    expect(value).toEqual({
      lists: [{ id: LIST, name: "Mes envies" }],
      input: "Une lampe https://x.test/lampe",
    });
    expect(api.calls.map((call) => call.method)).toEqual(["GET"]);
  });

  it("sends a signed-out person to the sign-in page, and back here with what was shared", async () => {
    fakeApi({ "GET /manage/lists": () => json({ error: "unauthenticated" }, 401) });
    const { thrown } = await run(
      load,
      fakeEvent({ url: "https://app.test/ajouter?url=https%3A%2F%2Fx.test" }).event,
    );
    expect(thrown).toMatchObject({
      status: 303,
      location: `/connexion?retour=${encodeURIComponent("/ajouter?url=https%3A%2F%2Fx.test")}`,
    });
  });

  it("adds into the list the person picked, with one tap", async () => {
    const api = fakeApi({
      "POST /manage/items": () => json({ id: ITEM, title: "Une lampe", listId: LIST, duplicateOf: [] }, 201),
    });
    const { value } = await run(
      actions.add,
      fakeEvent({ form: { input: "Une lampe https://x.test/lampe", listId: LIST } }).event,
    );
    expect(value).toEqual({
      add: { item: { id: ITEM, title: "Une lampe", listId: LIST }, duplicate: false },
    });
    expect(api.calls[0]?.body).toEqual({ input: "Une lampe https://x.test/lampe", listId: LIST });
  });

  it("undoes an add of a link already there", async () => {
    const api = fakeApi({
      [`PATCH /manage/items/${ITEM}`]: (body) => json({ id: ITEM, title: "x", ...(body as object) }),
    });
    await run(actions.status, fakeEvent({ form: { itemId: ITEM, status: "archived" } }).event);
    expect(api.calls[0]?.body).toEqual({ status: "archived" });
  });
});
