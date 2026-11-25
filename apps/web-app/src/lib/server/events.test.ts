import { describe, expect, it } from "vitest";

import { EVENT_KINDS, today } from "../format.ts";
import { giftsFor, readEventForm } from "./events.ts";

const form = (fields: Record<string, string>) => ({
  request: new Request("https://app.test/", { method: "POST", body: new URLSearchParams(fields) }),
});
const valid = { name: " Noël ", kind: "christmas", date: "2026-12-24", revealDelayDays: "3" };

describe("readEventForm", () => {
  it("gives the fields, cleaned", async () => {
    expect((await readEventForm(form(valid), "create")).fields).toEqual({
      name: "Noël",
      kind: "christmas",
      date: "2026-12-24",
      revealDelayDays: 3,
    });
  });

  it("says what is wrong, keeping what was typed", async () => {
    for (const [patch, error] of [
      [{ name: "" }, "invalid_name"],
      [{ date: "24/12/2026" }, "invalid_date"],
      [{ date: "2026-13-45" }, "invalid_date"],
      [{ revealDelayDays: "-1" }, "invalid_delay"],
      [{ revealDelayDays: "2.5" }, "invalid_delay"],
      [{ kind: "wedding" }, "invalid_request"],
    ] as const) {
      const { failure } = await readEventForm(form({ ...valid, ...patch }), "update");
      expect(failure).toMatchObject({ status: 400, data: { update: { error, ...patch } } });
    }
  });
});

describe("giftsFor", () => {
  const entry = (type: string, payload: Record<string, unknown>) => ({
    id: 1,
    type,
    at: "",
    actorId: null,
    payload,
  });

  it("keeps this event's contributions and reservations, without the withdrawn ones", () => {
    expect(
      giftsFor(
        [
          entry("created", { title: "x" }),
          entry("contribution_added", {
            contributionId: "a",
            eventId: "e",
            amountCents: 2000,
            name: "Marie",
            message: "Joyeux Noël !",
          }),
          entry("reserved", { contributionId: "b", eventId: "e", units: 2, name: null }),
          entry("contribution_added", {
            contributionId: "c",
            eventId: "other",
            amountCents: 500,
            name: "Paul",
          }),
          entry("contribution_added", { contributionId: "d", eventId: "e", amountCents: 900, name: "Jo" }),
          entry("contribution_withdrawn", { contributionId: "d", eventId: "e" }),
        ],
        "e",
      ),
    ).toEqual([
      { name: "Marie", amountCents: 2000, units: null, message: "Joyeux Noël !" },
      { name: null, amountCents: null, units: 2, message: null },
    ]);
  });

  it("keeps the gifts made without an event apart", () => {
    const history = [
      entry("reserved", {
        contributionId: "a",
        eventId: null,
        units: null,
        name: "Paul",
        message: "Bon appétit",
      }),
      entry("reserved", { contributionId: "b", units: 1, name: "Jo" }),
      entry("reserved", { contributionId: "c", eventId: "e", name: "Léo" }),
    ];
    expect(giftsFor(history, null).map((gift) => [gift.name, gift.message])).toEqual([
      ["Paul", "Bon appétit"],
      ["Jo", null],
    ]);
    expect(giftsFor(history, "e").map((gift) => gift.name)).toEqual(["Léo"]);
  });
});

describe("format", () => {
  it("lists the kinds of event and tells today", () => {
    expect(EVENT_KINDS).toEqual(["birthday", "christmas", "other"]);
    expect(today(new Date("2026-11-23T23:30:00Z"))).toBe("2026-11-23");
  });
});
