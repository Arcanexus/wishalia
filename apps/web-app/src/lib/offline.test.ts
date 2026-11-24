import { describe, expect, it } from "vitest";

import { strategy } from "./offline.ts";

const ORIGIN = "https://app.test";
const STATIC = new Set(["/_app/immutable/entry/start.abc.js", "/icons/icon-192.png", "/hors-ligne.html"]);
const at = (path: string, method = "GET", mode: RequestMode = "cors", origin = ORIGIN) =>
  strategy(method, mode, new URL(path, origin), ORIGIN, STATIC);

describe("the service worker's strategy", () => {
  it("serves the app's code and static files from the cache", () => {
    expect(at("/_app/immutable/entry/start.abc.js")).toBe("cache-first");
    expect(at("/icons/icon-192.png", "GET", "no-cors")).toBe("cache-first");
  });

  it("takes pages from the network, with the offline page as a fallback", () => {
    expect(at("/listes/1", "GET", "navigate")).toBe("page");
    expect(at("/ajouter?url=https%3A%2F%2Fx.test", "GET", "navigate")).toBe("page");
  });

  it("never caches what is private or changing", () => {
    expect(at("/listes/1/__data.json")).toBe("network");
    expect(at("/img/abc/def")).toBe("network");
    expect(at("/manifest.webmanifest")).toBe("network");
    expect(at("/icons/icon-192.png?v=2")).toBe("network");
  });

  it("leaves form posts and other sites alone", () => {
    expect(at("/?/add", "POST", "navigate")).toBe("network");
    expect(at("/_app/immutable/entry/start.abc.js", "GET", "cors", "https://evil.test")).toBe("network");
  });
});
