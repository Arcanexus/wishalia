import { describe, expect, it } from "vitest";

import { loadConfig } from "./config.js";
import {
  deviceMarkerCookieName,
  deviceMarkerSetCookie,
  hashToken,
  isWellFormedToken,
  newToken,
  readCookie,
  readDeviceMarker,
  writeDeviceMarker,
} from "./tokens.js";

const secret = "a-test-secret-that-is-long-enough-0123456789";

describe("tokens", () => {
  it("makes distinct, well-formed tokens and hashes them", () => {
    const token = newToken();
    expect(isWellFormedToken(token)).toBe(true);
    expect(newToken()).not.toBe(token);
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).toBe(hashToken(token));
  });

  it("rejects malformed tokens", () => {
    expect(isWellFormedToken("short")).toBe(false);
    expect(isWellFormedToken(`${"a".repeat(42)}!`)).toBe(false);
    expect(isWellFormedToken(undefined)).toBe(false);
  });
});

describe("device marker", () => {
  it("proves the owners it was written for", () => {
    const one = writeDeviceMarker(secret, [], "owner-1");
    const two = writeDeviceMarker(secret, readDeviceMarker(secret, one), "owner-2");
    expect(readDeviceMarker(secret, two)).toEqual(["owner-2", "owner-1"]);
    expect(readDeviceMarker(secret, writeDeviceMarker(secret, ["owner-1"], "owner-1"))).toEqual(["owner-1"]);
  });

  it("ignores a forged, re-signed or malformed marker", () => {
    const marker = writeDeviceMarker(secret, [], "owner-1");
    expect(readDeviceMarker("another-secret", marker)).toEqual([]);
    const signature = marker.split(".")[1];
    expect(readDeviceMarker(secret, `owner-2.${signature}`)).toEqual([]);
    expect(readDeviceMarker(secret, "garbage")).toEqual([]);
    expect(readDeviceMarker(secret, "owner-1.short")).toEqual([]);
    expect(readDeviceMarker(secret, undefined)).toEqual([]);
  });

  it("keeps at most five owners", () => {
    let ids: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      ids = readDeviceMarker(secret, writeDeviceMarker(secret, ids, `owner-${index}`));
    }
    expect(ids).toEqual(["owner-6", "owner-5", "owner-4", "owner-3", "owner-2"]);
  });

  it("is a __Secure- cookie shared by the hosts in production", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      APP_ORIGIN: "https://app.wishalia.example",
      PUBLIC_ORIGIN: "https://wishalia.example",
      COOKIE_DOMAIN: ".wishalia.example",
    });
    expect(deviceMarkerCookieName(config)).toBe("__Secure-wishalia.owner_device");
    const cookie = deviceMarkerSetCookie(config, "value");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Domain=.wishalia.example");
  });

  it("is a plain cookie in local http", () => {
    const config = loadConfig({
      NODE_ENV: "test",
      APP_ORIGIN: "http://localhost:5173",
      PUBLIC_ORIGIN: "http://localhost:5174",
    });
    expect(deviceMarkerCookieName(config)).toBe("wishalia.owner_device");
    const cookie = deviceMarkerSetCookie(config, "value");
    expect(cookie).not.toContain("Secure");
    expect(cookie).not.toContain("Domain");
  });

  it("reads one cookie of a Cookie header", () => {
    expect(readCookie("a=1; b=2=3; c", "b")).toBe("2=3");
    expect(readCookie("a=1", "b")).toBeUndefined();
    expect(readCookie(undefined, "a")).toBeUndefined();
  });
});
