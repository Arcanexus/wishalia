import { describe, expect, it } from "vitest";

import { DELETED_NOTICE_DAYS, deletedItemFields, goneGift } from "./removal.js";

const now = new Date("2026-12-01T12:00:00Z");
const active = { status: "active" as const, withdrawnAt: null };

describe("goneGift", () => {
  it("says nothing while the item is on the list", () => {
    expect(goneGift({ status: "open", deletedAt: null, contribution: active }, now)).toBeNull();
    expect(goneGift({ status: "received", deletedAt: null, contribution: active }, now)).toBeNull();
  });

  it("tells about an archived item while the gift is kept", () => {
    expect(goneGift({ status: "archived", deletedAt: null, contribution: active }, now)).toBe("archived");
  });

  it("says nothing once the guest took the gift of an archived item back", () => {
    const withdrawn = { status: "withdrawn" as const, withdrawnAt: now };
    expect(goneGift({ status: "archived", deletedAt: null, contribution: withdrawn }, now)).toBeNull();
  });

  it("tells about a deleted item whose deletion cancelled the gift", () => {
    const deletedAt = new Date("2026-11-30T08:00:00Z");
    const cancelled = { status: "withdrawn" as const, withdrawnAt: deletedAt };
    expect(goneGift({ status: "archived", deletedAt, contribution: cancelled }, now)).toBe("deleted");
    expect(goneGift({ status: "archived", deletedAt, contribution: active }, now)).toBe("deleted");
  });

  it("says nothing of a gift taken back before the deletion", () => {
    const deletedAt = new Date("2026-11-30T08:00:00Z");
    const before = { status: "withdrawn" as const, withdrawnAt: new Date("2026-11-20T08:00:00Z") };
    expect(goneGift({ status: "archived", deletedAt, contribution: before }, now)).toBeNull();
    const unknown = { status: "withdrawn" as const, withdrawnAt: null };
    expect(goneGift({ status: "archived", deletedAt, contribution: unknown }, now)).toBeNull();
  });

  it("stops telling after the notice days", () => {
    const deletedAt = new Date(now.getTime() - (DELETED_NOTICE_DAYS + 1) * 86_400_000);
    const cancelled = { status: "withdrawn" as const, withdrawnAt: deletedAt };
    expect(goneGift({ status: "archived", deletedAt, contribution: cancelled }, now)).toBeNull();
  });
});

describe("deletedItemFields", () => {
  it("archives, marks and empties the item, title kept", () => {
    const fields = deletedItemFields(now);
    expect(fields).toMatchObject({
      status: "archived",
      deletedAt: now,
      url: null,
      notes: null,
      imageId: null,
    });
    expect(fields).not.toHaveProperty("title");
  });
});
