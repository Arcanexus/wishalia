import { describe, expect, it } from "vitest";

import {
  amountTarget,
  fundingByEvent,
  itemState,
  overshoot,
  progress,
  remainingToFund,
  reservedUnits,
  takesShares,
  timesGiven,
  totalFunded,
  type ContributionFunding,
  type WishFunding,
} from "./funding.js";
import { cents } from "./money.js";

const pledge = (
  eventId: string,
  amount: number,
  status: "active" | "withdrawn" = "active",
): ContributionFunding => ({
  eventId,
  status,
  amountCents: cents(amount),
});
const reserve = (
  eventId: string,
  units = 1,
  status: "active" | "withdrawn" = "active",
): ContributionFunding => ({
  eventId,
  status,
  units,
});

const pool: WishFunding = { kind: "pool", repeatable: false, targetCents: cents(10000) };
const quantity: WishFunding = { kind: "quantity", repeatable: false, quantity: 4 };
const unique: WishFunding = { kind: "unique", repeatable: false };

describe("pool funding", () => {
  it("adds the active contributions of every event", () => {
    expect(
      totalFunded([pledge("xmas", 3000), pledge("birthday", 2000), pledge("xmas", 500, "withdrawn")]),
    ).toBe(5000);
  });

  it("computes what is left, never negative", () => {
    expect(remainingToFund(cents(10000), cents(6000))).toBe(4000);
    expect(remainingToFund(cents(10000), cents(12000))).toBe(0);
  });

  it("allows overshoot and measures it", () => {
    expect(overshoot(cents(10000), cents(12500))).toBe(2500);
    expect(overshoot(cents(10000), cents(9000))).toBe(0);
  });

  it("splits the funding by event, in order, for the segmented bar", () => {
    const segments = fundingByEvent([
      pledge("birthday", 1000),
      pledge("xmas", 2000),
      pledge("birthday", 500),
      pledge("xmas", 700, "withdrawn"),
    ]);
    expect([...segments]).toEqual([
      ["birthday", 1500],
      ["xmas", 2000],
    ]);
  });

  it("recomputes the progress when the price changes after contributions", () => {
    const contributions = [pledge("xmas", 8000)];
    expect(progress(pool, contributions)).toBe(0.8);
    expect(progress({ ...pool, targetCents: cents(16000) }, contributions)).toBe(0.5);
  });

  it("caps the progress at 1 when overshooting", () => {
    expect(progress(pool, [pledge("xmas", 15000)])).toBe(1);
  });

  it("treats a pool without a target as complete once someone pledges", () => {
    expect(progress({ ...pool, targetCents: null }, [])).toBe(0);
    expect(progress({ ...pool, targetCents: null }, [pledge("xmas", 100)])).toBe(1);
  });
});

describe("reservations", () => {
  it("counts the active reserved copies", () => {
    expect(reservedUnits([reserve("xmas", 2), reserve("birthday"), reserve("xmas", 1, "withdrawn")])).toBe(3);
  });

  it("measures a quantity item copy by copy", () => {
    expect(progress(quantity, [reserve("xmas", 3)])).toBe(0.75);
    expect(progress(quantity, [reserve("xmas", 9)])).toBe(1);
    expect(progress({ ...quantity, quantity: null }, [reserve("xmas")])).toBe(1);
  });

  it("treats a unique item as taken or free", () => {
    expect(progress(unique, [])).toBe(0);
    expect(progress(unique, [reserve("xmas")])).toBe(1);
    expect(progress(unique, [reserve("xmas", 1, "withdrawn")])).toBe(0);
  });
});

describe("itemState", () => {
  it.each([
    [[], "free"],
    [[pledge("xmas", 1000)], "in_progress"],
    [[pledge("xmas", 7999)], "in_progress"],
    [[pledge("xmas", 8000)], "almost"],
    [[pledge("xmas", 10000)], "complete"],
    [[pledge("xmas", 13000)], "complete"],
  ] as const)("pool with %j is %s", (contributions, expected) => {
    expect(itemState(pool, contributions)).toBe(expected);
  });

  it("goes back to free when the only contribution is withdrawn", () => {
    expect(itemState(pool, [pledge("xmas", 5000, "withdrawn")])).toBe("free");
  });

  it("judges a repeatable item on the event shown only", () => {
    const repeatable: WishFunding = { ...unique, repeatable: true };
    const contributions = [reserve("xmas-2025")];
    expect(itemState(repeatable, contributions, "xmas-2026")).toBe("free");
    expect(itemState(repeatable, contributions, "xmas-2025")).toBe("complete");
    expect(itemState(repeatable, contributions)).toBe("complete");
  });

  it("judges a non-repeatable item on every event", () => {
    expect(itemState(unique, [reserve("birthday")], "xmas")).toBe("complete");
  });
});

describe("timesGiven", () => {
  it("counts the events with an active contribution", () => {
    expect(
      timesGiven([
        reserve("xmas-2024"),
        reserve("xmas-2025"),
        reserve("xmas-2025"),
        reserve("bday", 1, "withdrawn"),
      ]),
    ).toBe(2);
  });
});

describe("a gift shared by amounts", () => {
  const priced: WishFunding = { kind: "unique", repeatable: false, priceCents: cents(20000) };

  it("is any unique gift with a price, given once", () => {
    expect(takesShares(priced)).toBe(true);
    expect(takesShares(unique)).toBe(false);
    expect(takesShares({ ...priced, priceCents: cents(0) })).toBe(false);
    expect(takesShares({ ...priced, repeatable: true })).toBe(false);
    expect(takesShares({ ...pool, priceCents: cents(20000) })).toBe(false);
  });
  it("is measured against its price, as a pool is against its target", () => {
    expect(amountTarget(priced)).toBe(20000);
    expect(amountTarget(pool)).toBe(10000);
    expect(amountTarget(unique)).toBeNull();
    expect(amountTarget(quantity)).toBeNull();
  });
  it("fills up with the shares until they reach the price", () => {
    expect(progress(priced, [])).toBe(0);
    expect(progress(priced, [pledge("e1", 5000)])).toBe(0.25);
    expect(itemState(priced, [pledge("e1", 5000), pledge("e2", 11000)])).toBe("almost");
    expect(itemState(priced, [pledge("e1", 5000), pledge("e2", 15000)])).toBe("complete");
    expect(itemState(priced, [pledge("e1", 5000, "withdrawn")])).toBe("free");
  });
  it("is complete when someone reserves it whole", () => {
    expect(itemState(priced, [reserve("e1")])).toBe("complete");
  });
  it("ignores amounts on a gift without a price", () => {
    expect(progress(unique, [pledge("e1", 5000)])).toBe(0);
  });
});
