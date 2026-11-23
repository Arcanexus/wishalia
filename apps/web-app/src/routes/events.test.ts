import { afterEach, describe, expect, it, vi } from "vitest";

import { fakeApi, fakeEvent, json, outcome } from "../test/event.ts";
import { actions as eventActions, load as eventPage } from "./(app)/evenements/[id]/+page.server.ts";
import { actions as eventsActions, load as eventsPage } from "./(app)/evenements/+page.server.ts";

const EVENT = "7a1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const LIST = "4f1f3f2e-1c2d-4e5f-8a9b-0c1d2e3f4a5b";
const ITEM = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a11";
const OTHER = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a12";
const CLOSED = "0b6f8a4e-6a52-4a6c-9a39-6f4f3c0b9a13";
const wishEvent = (patch: object = {}) => ({
  id: EVENT,
  name: "Noël",
  kind: "christmas",
  date: "2026-12-24",
  revealDelayDays: 3,
  secretLifted: false,
  canReveal: false,
  ...patch,
});
const fields = { name: "Noël", kind: "christmas", date: "2026-12-24", revealDelayDays: "3" };

afterEach(() => vi.unstubAllGlobals());

const run = (handler: unknown, event: unknown) =>
  outcome(() => (handler as (event: unknown) => unknown)(event));
const at = (form?: Record<string, string>) =>
  fakeEvent({ params: { id: EVENT }, ...(form ? { form } : {}) }).event;

describe("the events page", () => {
  it("lists the events, and opens a new one once created", async () => {
    const api = fakeApi({
      "GET /manage/events": () => json([wishEvent()]),
      "POST /manage/events": (body) => json(wishEvent(body as object), 201),
    });
    expect((await run(eventsPage, fakeEvent().event)).value).toEqual({ events: [wishEvent()] });
    expect((await run(eventsActions.create, fakeEvent({ form: fields }).event)).thrown).toMatchObject({
      status: 303,
      location: `/evenements/${EVENT}`,
    });
    expect(api.calls.at(-1)?.body).toEqual({ ...fields, revealDelayDays: 3 });
  });

  it("explains a wrong field without calling the API, and passes the API's refusal on", async () => {
    const api = fakeApi({ "POST /manage/events": () => json({ error: "invalid_request" }, 400) });
    expect(
      (await run(eventsActions.create, fakeEvent({ form: { ...fields, date: "" } }).event)).value,
    ).toMatchObject({
      status: 400,
      data: { create: { error: "invalid_date" } },
    });
    expect(api.calls).toHaveLength(0);
    expect((await run(eventsActions.create, fakeEvent({ form: fields }).event)).value).toMatchObject({
      data: { create: { error: "invalid_request", name: "Noël" } },
    });
  });
});

describe("an event page", () => {
  const items = (id: string, status = "open") => ({ id, title: id.slice(-2), status, priceCents: null });

  it("shows the chosen items, what can still be chosen, and turns Christmas for a Christmas event", async () => {
    const api = fakeApi({
      "GET /manage/events": () => json([wishEvent()]),
      "GET /manage/lists": () => json([{ id: LIST, name: "Mes envies" }]),
      [`GET /manage/events/${EVENT}/items`]: () => json([items(ITEM)]),
      [`GET /manage/lists/${LIST}/items`]: () => json([items(ITEM), items(OTHER), items(CLOSED, "received")]),
    });
    const event = at();
    expect((await run(eventPage, event)).value).toEqual({
      event: wishEvent(),
      selected: [items(ITEM)],
      choices: [{ list: { id: LIST, name: "Mes envies" }, items: [items(OTHER)] }],
      gifts: {},
    });
    expect(event.locals.christmas).toBe(true);
    // The secret is kept: no history asked
    expect(api.calls.some((call) => call.path.endsWith("/history"))).toBe(false);
  });

  it("shows who gave what once the secret is lifted", async () => {
    fakeApi({
      "GET /manage/events": () => json([wishEvent({ secretLifted: true, kind: "birthday" })]),
      "GET /manage/lists": () => json([]),
      [`GET /manage/events/${EVENT}/items`]: () => json([items(ITEM)]),
      [`GET /manage/items/${ITEM}/history`]: () =>
        json([
          {
            id: 1,
            type: "contribution_added",
            payload: { contributionId: "a", eventId: EVENT, amountCents: 1000, name: "Marie" },
          },
        ]),
    });
    const event = at();
    expect((await run(eventPage, event)).value).toMatchObject({
      gifts: { [ITEM]: [{ name: "Marie", amountCents: 1000, units: null }] },
    });
    expect(event.locals.christmas).toBe(false);
  });

  it("answers 404 for someone else's event or a wrong address", async () => {
    fakeApi({ "GET /manage/events": () => json([]), "GET /manage/lists": () => json([]) });
    for (const id of [EVENT, "nope"]) {
      expect((await run(eventPage, fakeEvent({ params: { id } }).event)).thrown).toMatchObject({
        status: 404,
      });
    }
  });

  it("saves its settings, only the name and type once the secret is lifted", async () => {
    const api = fakeApi({ [`PATCH /manage/events/${EVENT}`]: (body) => json(wishEvent(body as object)) });
    expect((await run(eventActions.update, at({ ...fields, frozen: "0" }))).value).toEqual({
      update: { saved: true },
    });
    expect(api.calls[0]?.body).toEqual({ ...fields, revealDelayDays: 3 });
    await run(eventActions.update, at({ ...fields, frozen: "1" }));
    expect(api.calls[1]?.body).toEqual({ name: "Noël", kind: "christmas" });
    expect((await run(eventActions.update, at({ ...fields, name: "" }))).value).toMatchObject({
      status: 400,
    });
  });

  it("passes a refused setting on", async () => {
    fakeApi({ [`PATCH /manage/events/${EVENT}`]: () => json({ error: "secret_already_lifted" }, 409) });
    expect((await run(eventActions.update, at(fields))).value).toMatchObject({
      status: 409,
      data: { update: { error: "secret_already_lifted" } },
    });
  });

  it("adds and removes items", async () => {
    const api = fakeApi({
      [`PUT /manage/events/${EVENT}/items/${ITEM}`]: () => new Response(null, { status: 204 }),
      [`DELETE /manage/events/${EVENT}/items/${ITEM}`]: () => new Response(null, { status: 204 }),
    });
    expect((await run(eventActions.addItem, at({ itemId: ITEM }))).value).toEqual({ items: { added: ITEM } });
    expect((await run(eventActions.removeItem, at({ itemId: ITEM }))).value).toEqual({
      items: { removed: ITEM },
    });
    expect(api.calls.map((call) => call.method)).toEqual(["PUT", "DELETE"]);
    for (const action of [eventActions.addItem, eventActions.removeItem]) {
      expect((await run(action, at({ itemId: "../x" }))).value).toMatchObject({ status: 400 });
    }
    expect((await run(eventActions.addItem, at({ itemId: OTHER }))).value).toMatchObject({
      status: 404,
      data: { items: { error: "not_found" } },
    });
  });

  it("lifts the secret only when confirmed, and says when it is too early", async () => {
    let status = 409;
    const api = fakeApi({
      [`POST /manage/events/${EVENT}/reveal`]: () =>
        status === 200 ? json(wishEvent({ secretLifted: true })) : json({ error: "too_early" }, status),
    });
    expect((await run(eventActions.reveal, at({}))).value).toMatchObject({
      status: 400,
      data: { reveal: { error: "confirm" } },
    });
    expect(api.calls).toHaveLength(0);
    expect((await run(eventActions.reveal, at({ confirm: "oui" }))).value).toMatchObject({
      status: 409,
      data: { reveal: { error: "too_early" } },
    });
    status = 200;
    expect((await run(eventActions.reveal, at({ confirm: "oui" }))).value).toEqual({
      reveal: { lifted: true },
    });
  });

  it("shows an API failure as a message, keeping the page", async () => {
    fakeApi({ [`PATCH /manage/events/${EVENT}`]: () => json({}, 500) });
    expect((await run(eventActions.update, at(fields))).value).toMatchObject({ status: 500 });
  });
});
