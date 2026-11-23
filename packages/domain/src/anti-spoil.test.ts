import { describe, expect, it } from "vitest";

import {
  canRevealSecret,
  canSeeContributions,
  canSeeHistoryEntry,
  isLifted,
  isSecretLifted,
  resolveViewer,
  revealAvailableAt,
  type RevealState,
  type ViewerRole,
} from "./anti-spoil.js";

const OWNER = "user-owner";
const GUEST = "user-guest";

// Christmas 2026, 3 days of delay: the owner may lift the secret from 2026-12-29T00:00Z
const christmas = { eventDate: "2026-12-25", revealDelayDays: 3 };
const kept: RevealState = { ...christmas, revealedAt: null };
const before = new Date("2026-12-20T12:00:00Z");
const eventDay = new Date("2026-12-25T23:59:59Z");
const duringDelay = new Date("2026-12-28T23:59:59Z");
const afterDelay = new Date("2026-12-29T00:00:00Z");
const lifted: RevealState = { ...christmas, revealedAt: afterDelay };

describe("resolveViewer", () => {
  it("recognises the owner by their session", () => {
    expect(resolveViewer({ ownerId: OWNER, sessionUserId: OWNER, hasValidShareLink: false })).toBe("owner");
  });

  it("recognises the owner by the device marker, without a session", () => {
    expect(
      resolveViewer({ ownerId: OWNER, deviceMarkerUserIds: [GUEST, OWNER], hasValidShareLink: true }),
    ).toBe("owner");
  });

  it("keeps the owner as owner when they open their own share link", () => {
    expect(resolveViewer({ ownerId: OWNER, sessionUserId: OWNER, hasValidShareLink: true })).toBe("owner");
  });

  it("treats a share link holder as a guest", () => {
    expect(resolveViewer({ ownerId: OWNER, sessionUserId: GUEST, hasValidShareLink: true })).toBe("guest");
    expect(resolveViewer({ ownerId: OWNER, sessionUserId: null, hasValidShareLink: true })).toBe("guest");
  });

  it("treats anyone else as anonymous", () => {
    expect(resolveViewer({ ownerId: OWNER, sessionUserId: GUEST, hasValidShareLink: false })).toBe(
      "anonymous",
    );
    expect(resolveViewer({ ownerId: OWNER, deviceMarkerUserIds: [GUEST], hasValidShareLink: false })).toBe(
      "anonymous",
    );
  });
});

describe("revealAvailableAt", () => {
  it("is the end of the event day plus the delay, in UTC", () => {
    expect(revealAvailableAt(christmas)).toEqual(afterDelay);
    expect(revealAvailableAt({ eventDate: "2026-12-25", revealDelayDays: 0 })).toEqual(
      new Date("2026-12-26T00:00:00Z"),
    );
  });

  it("handles the end of a month and a leap year", () => {
    expect(revealAvailableAt({ eventDate: "2028-02-28", revealDelayDays: 1 })).toEqual(
      new Date("2028-03-01T00:00:00Z"),
    );
  });

  it.each(["25/12/2026", "2026-12-25T00:00:00Z", ""])("rejects the date %j", (eventDate) => {
    expect(() => revealAvailableAt({ eventDate, revealDelayDays: 3 })).toThrow(RangeError);
  });

  it.each([-1, 1.5, Number.NaN])("rejects the delay %s", (revealDelayDays) => {
    expect(() => revealAvailableAt({ eventDate: "2026-12-25", revealDelayDays })).toThrow(RangeError);
  });
});

describe("canRevealSecret", () => {
  it.each([
    [before, false],
    [eventDay, false],
    [duringDelay, false],
    [afterDelay, true],
  ])("at %s: %s", (now, expected) => {
    expect(canRevealSecret(christmas, now)).toBe(expected);
  });
});

describe("isSecretLifted", () => {
  it("needs the owner to lift it", () => {
    expect(isSecretLifted(kept, new Date("2027-06-01T00:00:00Z"))).toBe(false);
  });

  it("is lifted once asked after the delay", () => {
    expect(isSecretLifted(lifted, afterDelay)).toBe(true);
  });

  it("ignores a reveal recorded in the future", () => {
    expect(isSecretLifted({ ...christmas, revealedAt: new Date("2027-01-10T00:00:00Z") }, afterDelay)).toBe(
      false,
    );
  });

  it("ignores a reveal dated before the delay was over (corrupted row)", () => {
    expect(isSecretLifted({ ...christmas, revealedAt: duringDelay }, duringDelay)).toBe(false);
  });
});

describe("canSeeContributions", () => {
  const moments = [before, eventDay, duringDelay, afterDelay, new Date("2030-01-01T00:00:00Z")];

  it.each(moments)("hides them from the owner while the secret is kept (%s)", (now) => {
    expect(canSeeContributions("owner", kept, now)).toBe(false);
  });

  it("hides them from the owner recognised by the device marker, like by the session", () => {
    const viaMarker = resolveViewer({
      ownerId: OWNER,
      deviceMarkerUserIds: [OWNER],
      hasValidShareLink: true,
    });
    expect(canSeeContributions(viaMarker, kept, duringDelay)).toBe(false);
  });

  it("shows them to the owner once the secret is lifted after the event", () => {
    expect(canSeeContributions("owner", lifted, afterDelay)).toBe(true);
  });

  it.each(moments)("shows them to a guest, before and after the event (%s)", (now) => {
    expect(canSeeContributions("guest", kept, now)).toBe(true);
    expect(canSeeContributions("guest", lifted, now)).toBe(true);
  });

  it.each(moments)("shows them to an anonymous visitor, the view folds them (%s)", (now) => {
    expect(canSeeContributions("anonymous", kept, now)).toBe(true);
  });
});

describe("canSeeHistoryEntry", () => {
  const viewers: ViewerRole[] = ["owner", "guest", "anonymous"];

  it.each(viewers)("shows non-secret entries to the %s", (viewer) => {
    expect(canSeeHistoryEntry("owner", viewer, kept, before)).toBe(true);
  });

  it("never shows guest-only entries to the owner, even after the reveal", () => {
    expect(canSeeHistoryEntry("guests", "owner", kept, before)).toBe(false);
    expect(canSeeHistoryEntry("guests", "owner", lifted, afterDelay)).toBe(false);
    expect(canSeeHistoryEntry("guests", "guest", kept, before)).toBe(true);
    expect(canSeeHistoryEntry("guests", "anonymous", kept, before)).toBe(true);
  });

  it("seals contribution entries for the owner until the reveal", () => {
    expect(canSeeHistoryEntry("sealed", "owner", kept, afterDelay)).toBe(false);
    expect(canSeeHistoryEntry("sealed", "owner", lifted, afterDelay)).toBe(true);
    expect(canSeeHistoryEntry("sealed", "guest", kept, before)).toBe(true);
  });
});

describe("the secret of a contribution without an event", () => {
  const now = new Date("2026-12-01T12:00:00Z");

  it("hides it from the owner until they mark the item received", () => {
    expect(canSeeContributions("owner", { itemReceived: false }, now)).toBe(false);
    expect(canSeeContributions("owner", { itemReceived: true }, now)).toBe(true);
    expect(isLifted({ itemReceived: true }, now)).toBe(true);
  });

  it("shows it to the guests all along", () => {
    expect(canSeeContributions("guest", { itemReceived: false }, now)).toBe(true);
    expect(canSeeHistoryEntry("sealed", "owner", { itemReceived: false }, now)).toBe(false);
    expect(canSeeHistoryEntry("sealed", "owner", { itemReceived: true }, now)).toBe(true);
  });
});
