import { describe, expect, it } from "vitest";

import { refuseContribution } from "./sharing.js";
import { progress } from "./funding.js";
import { inReadingOrder, refuseVolume, seriesPriceCents, seriesTitleOf, volumeLabel } from "./series.js";

const dragonBall = [30, 31, 32, 33, 34].map((n) => `Dragon Ball Perfect Edition T${n}`);

describe("seriesTitleOf", () => {
  it("keeps the words every volume starts with", () => {
    expect(seriesTitleOf(dragonBall)).toBe("Dragon Ball Perfect Edition");
  });
  it("drops a last word that announces a number", () => {
    expect(seriesTitleOf(["Harry Potter, tome 1", "Harry Potter, tome 2"])).toBe("Harry Potter");
    expect(seriesTitleOf(["One Piece Vol. 1", "One Piece Vol. 2"])).toBe("One Piece");
    expect(seriesTitleOf(["Astérix - 1", "Astérix - 2"])).toBe("Astérix");
  });
  it("ignores the case", () => {
    expect(seriesTitleOf(["naruto 1", "Naruto 2"])).toBe("naruto");
  });
  it("takes the first title when they share nothing, or alone", () => {
    expect(seriesTitleOf(["Lampe", "Vélo"])).toBe("Lampe");
    expect(seriesTitleOf(["  Tintin au Tibet "])).toBe("Tintin au Tibet");
  });
  it("drops the number at the end of a single title", () => {
    expect(seriesTitleOf(["Dragon Ball Perfect Edition T30"])).toBe("Dragon Ball Perfect Edition");
    expect(seriesTitleOf(["Harry Potter, tome 4"])).toBe("Harry Potter");
    expect(seriesTitleOf(["Astérix - 12"])).toBe("Astérix");
    expect(seriesTitleOf(["Naruto"])).toBe("Naruto");
    expect(seriesTitleOf(["42"])).toBe("42");
  });
  it("gives null without a title", () => {
    expect(seriesTitleOf([])).toBeNull();
    expect(seriesTitleOf(["  "])).toBeNull();
  });
});

describe("volumeLabel", () => {
  it("drops the series' name in front", () => {
    expect(volumeLabel("Dragon Ball Perfect Edition T30", "Dragon Ball Perfect Edition")).toBe("T30");
    expect(volumeLabel("Harry Potter, tome 2", "harry potter")).toBe("tome 2");
  });
  it("keeps the title when it does not start with the name on a word boundary", () => {
    expect(volumeLabel("Dragon Balls", "Dragon Ball")).toBe("Dragon Balls");
    expect(volumeLabel("Tintin", "Astérix")).toBe("Tintin");
    expect(volumeLabel("Astérix", "Astérix")).toBe("Astérix");
    expect(volumeLabel("Astérix 3", "  ")).toBe("Astérix 3");
  });
});

describe("inReadingOrder", () => {
  it("sorts by number, stable", () => {
    const sorted = inReadingOrder([
      { title: "T10" },
      { title: "T2" },
      { title: "t2", n: 1 },
      { title: "T1" },
    ]);
    expect(sorted.map((volume) => volume.title)).toEqual(["T1", "T2", "t2", "T10"]);
  });
});

describe("refuseVolume", () => {
  const series = { id: "s", listId: "l", kind: "series" as const, parentId: null };
  const wish = { id: "w", listId: "l", kind: "unique" as const, parentId: null };
  it("takes a wish of the same list", () => {
    expect(refuseVolume(wish, series)).toBeNull();
    expect(refuseVolume({ ...wish, kind: "pool", parentId: "other" }, series)).toBeNull();
  });
  it("refuses a series, another list, or a target that is no series", () => {
    expect(refuseVolume({ ...wish, kind: "series" }, series)).toBe("is_series");
    expect(refuseVolume({ ...wish, listId: "m" }, series)).toBe("other_list");
    expect(refuseVolume(wish, { ...series, kind: "unique" })).toBe("not_series");
  });
});

describe("seriesPriceCents", () => {
  it("adds the known prices of the volumes still wanted", () => {
    expect(
      seriesPriceCents([
        { priceCents: 1095, status: "open" },
        { priceCents: 1095, status: "open" },
        { priceCents: null, status: "open" },
        { priceCents: 900, status: "received" },
      ]),
    ).toBe(2190);
    expect(seriesPriceCents([{ priceCents: null, status: "open" }])).toBeNull();
  });
});

describe("a series itself", () => {
  const series = { kind: "series" as const, repeatable: false, status: "open" as const };
  it("takes no contribution and is never funded", () => {
    expect(refuseContribution(series, [], { eventId: null, units: 1 })).toBe("series_by_volume");
    expect(progress(series, [])).toBe(0);
  });
});
