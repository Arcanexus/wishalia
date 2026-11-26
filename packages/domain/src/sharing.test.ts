import { describe, expect, it } from "vitest";

import { cents } from "./money.js";
import { isShareLinkActive, refuseContribution, type ContributableWish } from "./sharing.js";

const now = new Date("2026-12-01T12:00:00Z");
const before = new Date("2026-11-30T12:00:00Z");
const after = new Date("2026-12-02T12:00:00Z");

describe("isShareLinkActive", () => {
  it("opens a link without expiry nor revocation", () => {
    expect(isShareLinkActive({ expiresAt: null, revokedAt: null }, now)).toBe(true);
  });
  it("closes an expired link, and keeps one that expires later", () => {
    expect(isShareLinkActive({ expiresAt: before, revokedAt: null }, now)).toBe(false);
    expect(isShareLinkActive({ expiresAt: now, revokedAt: null }, now)).toBe(false);
    expect(isShareLinkActive({ expiresAt: after, revokedAt: null }, now)).toBe(true);
  });
  it("closes a revoked link", () => {
    expect(isShareLinkActive({ expiresAt: null, revokedAt: before }, now)).toBe(false);
    expect(isShareLinkActive({ expiresAt: null, revokedAt: after }, now)).toBe(true);
  });
});

const wish = (overrides: Partial<ContributableWish> = {}): ContributableWish => ({
  kind: "unique",
  repeatable: false,
  status: "open",
  ...overrides,
});
const reservation = (eventId: string, units = 1, status: "active" | "withdrawn" = "active") => ({
  eventId,
  status,
  units,
});

describe("refuseContribution", () => {
  it("refuses anything on a received or archived item", () => {
    expect(refuseContribution(wish({ status: "received" }), [], { eventId: "e1" })).toBe("item_closed");
    expect(refuseContribution(wish({ status: "archived" }), [], { eventId: "e1" })).toBe("item_closed");
  });

  it("takes any positive amount on a pool, beyond the target too", () => {
    const pool = wish({ kind: "pool", targetCents: cents(1000) });
    const full = [{ eventId: "e1", status: "active" as const, amountCents: cents(1000) }];
    expect(refuseContribution(pool, full, { eventId: "e1", amountCents: 500 })).toBeNull();
    expect(refuseContribution(pool, [], { eventId: "e1" })).toBe("amount_required");
    expect(refuseContribution(pool, [], { eventId: "e1", amountCents: 0 })).toBe("amount_required");
  });

  it("reserves a unique item once, and again once withdrawn", () => {
    expect(refuseContribution(wish(), [], { eventId: "e1" })).toBeNull();
    expect(refuseContribution(wish(), [reservation("e1")], { eventId: "e2" })).toBe("already_reserved");
    expect(refuseContribution(wish(), [reservation("e1", 1, "withdrawn")], { eventId: "e1" })).toBeNull();
    expect(refuseContribution(wish(), [], { eventId: "e1", units: 2 })).toBe("units_required");
  });

  it("reserves a repeatable item once per event", () => {
    const repeatable = wish({ repeatable: true });
    expect(refuseContribution(repeatable, [reservation("e1")], { eventId: "e2" })).toBeNull();
    expect(refuseContribution(repeatable, [reservation("e1")], { eventId: "e1" })).toBe("already_reserved");
  });

  it("reserves copies of a quantity item up to what is left", () => {
    const books = wish({ kind: "quantity", quantity: 3 });
    expect(refuseContribution(books, [reservation("e1", 2)], { eventId: "e1", units: 1 })).toBeNull();
    expect(refuseContribution(books, [reservation("e1", 2)], { eventId: "e1", units: 2 })).toBe(
      "not_enough_left",
    );
    expect(refuseContribution(books, [], { eventId: "e1" })).toBe("units_required");
    expect(refuseContribution(books, [], { eventId: "e1", units: 1.5 })).toBe("units_required");
    const repeatable = wish({ kind: "quantity", quantity: 2, repeatable: true });
    expect(refuseContribution(repeatable, [reservation("e1", 2)], { eventId: "e2", units: 2 })).toBeNull();
  });
});

describe("refuseContribution without an event", () => {
  it("counts every contribution of a plain item, and the ones without an event of a repeatable one", () => {
    const plain = wish();
    expect(refuseContribution(plain, [reservation("e1")], { eventId: null })).toBe("already_reserved");
    const repeatable = wish({ repeatable: true });
    expect(refuseContribution(repeatable, [reservation("e1")], { eventId: null })).toBeNull();
    const none = [{ eventId: null, status: "active" as const, units: 1 }];
    expect(refuseContribution(repeatable, none, { eventId: null })).toBe("already_reserved");
  });
});

describe("refuseContribution on a gift shared by amounts", () => {
  const priced = wish({ priceCents: cents(20000) });
  const share = (amount: number, status: "active" | "withdrawn" = "active") => ({
    eventId: "e1",
    status,
    amountCents: cents(amount),
  });

  it("takes shares up to what is left of the price", () => {
    expect(refuseContribution(priced, [], { eventId: "e1", amountCents: 5000 })).toBeNull();
    expect(refuseContribution(priced, [share(15000)], { eventId: "e2", amountCents: 5000 })).toBeNull();
    expect(refuseContribution(priced, [share(15000)], { eventId: "e1", amountCents: 5001 })).toBe(
      "amount_too_high",
    );
    expect(refuseContribution(priced, [share(20000)], { eventId: "e1", amountCents: 1 })).toBe(
      "already_reserved",
    );
    expect(
      refuseContribution(priced, [share(20000, "withdrawn")], { eventId: "e1", amountCents: 1 }),
    ).toBeNull();
  });
  it("refuses an empty or broken amount", () => {
    expect(refuseContribution(priced, [], { eventId: "e1", amountCents: 0 })).toBe("amount_required");
    expect(refuseContribution(priced, [], { eventId: "e1", amountCents: 1.5 })).toBe("amount_required");
  });
  it("takes no share once someone reserved it whole, and no whole reservation once shared", () => {
    expect(refuseContribution(priced, [reservation("e1")], { eventId: "e1", amountCents: 100 })).toBe(
      "already_reserved",
    );
    expect(refuseContribution(priced, [share(100)], { eventId: "e1" })).toBe("already_shared");
    expect(refuseContribution(priced, [], { eventId: "e1" })).toBeNull();
  });
  it("takes any amount on a gift without a price, until someone reserves it whole", () => {
    expect(refuseContribution(wish(), [], { eventId: "e1", amountCents: 100 })).toBeNull();
    expect(refuseContribution(wish(), [share(900000)], { eventId: "e1", amountCents: 900000 })).toBeNull();
    expect(refuseContribution(wish(), [share(100)], { eventId: "e1", units: 1 })).toBe("already_shared");
    expect(refuseContribution(wish(), [reservation("e1")], { eventId: "e1", amountCents: 100 })).toBe(
      "already_reserved",
    );
    expect(refuseContribution(wish(), [], { eventId: "e1", amountCents: 0 })).toBe("amount_required");
  });

  it("takes no amount on a gift given at every occasion", () => {
    expect(
      refuseContribution(wish({ priceCents: cents(100), repeatable: true }), [], {
        eventId: "e1",
        amountCents: 100,
      }),
    ).toBe("shares_not_taken");
  });
});
