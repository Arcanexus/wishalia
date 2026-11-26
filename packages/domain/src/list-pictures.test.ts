import { describe, expect, it } from "vitest";

import {
  DEFAULT_LIST_ICON,
  isListIcon,
  LIST_ICONS,
  LIST_IMAGE_PREFIX,
  listImageKey,
  listPicture,
} from "./list-pictures.js";

describe("the picture of a list", () => {
  it("offers sixteen distinct icons, the default among them", () => {
    expect(LIST_ICONS).toHaveLength(16);
    expect(new Set(LIST_ICONS).size).toBe(LIST_ICONS.length);
    expect(LIST_ICONS).toContain(DEFAULT_LIST_ICON);
  });

  it("only knows its own icons", () => {
    expect(isListIcon("tree")).toBe(true);
    expect(isListIcon("Tree")).toBe(false);
    expect(isListIcon("../tree")).toBe(false);
    expect(isListIcon(null)).toBe(false);
    expect(isListIcon(3)).toBe(false);
  });

  it("shows the owner's image first, then the icon, then the default", () => {
    expect(listPicture({ icon: "tree", image: { small: "/img/a" } })).toEqual({
      kind: "image",
      image: { small: "/img/a" },
    });
    expect(listPicture({ icon: "tree", image: null })).toEqual({ kind: "icon", icon: "tree" });
    expect(listPicture({ icon: null, image: null })).toEqual({ kind: "icon", icon: DEFAULT_LIST_ICON });
    // An icon a later version removed falls back to the default
    expect(listPicture({ icon: "rocket", image: null })).toEqual({ kind: "icon", icon: DEFAULT_LIST_ICON });
  });

  it("keeps every image of a list under its own prefix", () => {
    const key = listImageKey("1b2c", "f00");
    expect(key).toBe("lists/1b2c/f00");
    expect(key.startsWith(LIST_IMAGE_PREFIX)).toBe(true);
  });
});
