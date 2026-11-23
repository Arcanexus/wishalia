import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../test/event.ts";
import { actions, load } from "./(app)/partage/+page.server.ts";

const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const EVENT = "7a1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const LINK = "6a1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";

afterEach(() => vi.unstubAllGlobals());

const run = (handler: unknown, event: unknown) =>
  outcome(() => (handler as (event: unknown) => unknown)(event));

describe("the share page", () => {
  it("lists the links and what can be shared, with the list or event it comes from chosen", async () => {
    fakeApi({
      "GET /manage/share-links": () => json([{ id: LINK }]),
      "GET /manage/lists": () => json([{ id: LIST, name: "Mes envies" }]),
      "GET /manage/events": () => json([{ id: EVENT, name: "Noël" }]),
    });
    const targets = [
      { value: `list:${LIST}`, label: "Liste « Mes envies »" },
      { value: `event:${EVENT}`, label: "Événement « Noël »" },
    ];
    expect(
      (await run(load, fakeEvent({ url: `https://app.test/partage?liste=${LIST}` }).event)).value,
    ).toEqual({
      links: [{ id: LINK }],
      targets,
      preset: `list:${LIST}`,
    });
    const fromEvent = await run(
      load,
      fakeEvent({ url: `https://app.test/partage?evenement=${EVENT}` }).event,
    );
    expect(fromEvent.value).toMatchObject({ preset: `event:${EVENT}` });
    expect((await run(load, fakeEvent({ url: "https://app.test/partage" }).event)).value).toMatchObject({
      preset: null,
    });
  });

  it("makes a link, gives its address once, and marks this device", async () => {
    const api = fakeApi({
      "POST /manage/share-links": (body) =>
        json({ id: LINK, ...(body as object), token: "t", url: "https://wishalia.test/s/t" }, 201, {
          "set-cookie": "__Secure-wishalia.owner_device=m; Path=/; HttpOnly; Secure",
        }),
    });
    const { event, setCookies } = fakeEvent({
      form: { target: `event:${EVENT}`, audience: " Mamie ", expires: "2027-01-31" },
    });
    expect((await run(actions.create, event)).value).toEqual({
      created: { id: LINK, audience: "Mamie", url: "https://wishalia.test/s/t" },
    });
    expect(api.calls[0]?.body).toEqual({
      scope: "event",
      eventId: EVENT,
      audience: "Mamie",
      expiresAt: "2027-01-31T23:59:59Z",
    });
    expect(setCookies[0]).toMatchObject({
      name: "__Secure-wishalia.owner_device",
      options: { secure: true },
    });

    await run(
      actions.create,
      fakeEvent({ form: { target: `list:${LIST}`, audience: "Les cousins", expires: "" } }).event,
    );
    expect(api.calls[1]?.body).toEqual({
      scope: "list",
      listId: LIST,
      audience: "Les cousins",
      expiresAt: null,
    });
  });

  it("explains what is wrong, without calling the API", async () => {
    const api = fakeApi({});
    for (const [form, error] of [
      [{ target: "list:nope", audience: "Mamie" }, "invalid_target"],
      [{ target: `share:${LIST}`, audience: "Mamie" }, "invalid_target"],
      [{ target: `list:${LIST}`, audience: " " }, "invalid_audience"],
      [{ target: `list:${LIST}`, audience: "Mamie", expires: "31/01/2027" }, "invalid_expires"],
    ] as const) {
      expect((await run(actions.create, fakeEvent({ form }).event)).value).toMatchObject({
        status: 400,
        data: { create: { error } },
      });
    }
    expect(api.calls).toHaveLength(0);
  });

  it("passes the API's refusals on: a past date, a list gone, a session gone", async () => {
    let answer = () => json({ error: "invalid_request" }, 400);
    fakeApi({ "POST /manage/share-links": () => answer() });
    const send = (expires: string) =>
      run(actions.create, fakeEvent({ form: { target: `list:${LIST}`, audience: "Mamie", expires } }).event);
    expect((await send("2020-01-01")).value).toMatchObject({
      status: 400,
      data: { create: { error: "invalid_expires" } },
    });
    answer = () => json({ error: "not_found" }, 404);
    expect((await send("")).value).toMatchObject({ status: 404, data: { create: { error: "not_found" } } });
    answer = () => new Response("oops", { status: 502 });
    expect((await send("")).value).toMatchObject({ status: 502, data: { create: { error: "unknown" } } });
    answer = () => json({ error: "unauthenticated" }, 401);
    expect((await send("")).thrown).toMatchObject({ status: 303, location: "/connexion?retour=%2Fpartage" });
  });

  it("revokes a link for good", async () => {
    const api = fakeApi({
      [`POST /manage/share-links/${LINK}/revoke`]: () => json({ id: LINK, audience: "Mamie", active: false }),
    });
    expect((await run(actions.revoke, fakeEvent({ form: { id: LINK } }).event)).value).toEqual({
      revoke: { audience: "Mamie" },
    });
    expect((await run(actions.revoke, fakeEvent({ form: { id: "x" } }).event)).value).toMatchObject({
      status: 400,
    });
    expect(api.calls).toHaveLength(1);
    expect((await run(actions.revoke, fakeEvent({ form: { id: EVENT } }).event)).value).toMatchObject({
      status: 404,
      data: { revoke: { error: "not_found" } },
    });
  });
});
