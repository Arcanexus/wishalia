import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

import type { Config } from "./config.js";

/**
 * Secrets given to people: share link tokens, contribution withdraw keys, device markers.
 * Only hashes are stored, so that a database leak opens no list and withdraws nothing.
 */

/** A new random token: 32 bytes, base64url (43 characters). */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

/** What the database keeps of a token: its SHA-256, hex. A token has 256 bits, no salt needed. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A token as a person may send it back: base64url, the length newToken gives. */
export function isWellFormedToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/**
 * The device marker (spec §3): a long-lived cookie, put on the device of an owner when they create
 * or copy a share link, so that the public view recognises them without a session. It holds the
 * ids of the owners of this device, each signed with the secret (HMAC-SHA256): nobody can forge
 * the marker of someone else, and a family tablet can carry several owners.
 */
export const DEVICE_MARKER_COOKIE = "wishalia.owner_device";
/** Browsers cap a cookie at 400 days. */
export const DEVICE_MARKER_MAX_AGE = 400 * 24 * 3600;
const MAX_MARKED_OWNERS = 5;

function sign(secret: string, userId: string): string {
  return createHmac("sha256", secret).update(`device-marker:${userId}`).digest("base64url");
}

/** The owner ids a marker value proves. Anything malformed or badly signed is ignored. */
export function readDeviceMarker(secret: string, value: string | undefined): string[] {
  if (!value) return [];
  const ids: string[] = [];
  for (const entry of value.split("~").slice(0, MAX_MARKED_OWNERS)) {
    const [userId, signature] = entry.split(".");
    if (!userId || !signature) continue;
    const expected = Buffer.from(sign(secret, userId));
    const given = Buffer.from(signature);
    if (expected.length === given.length && timingSafeEqual(expected, given)) ids.push(userId);
  }
  return ids;
}

/** A marker value that adds this owner to the ones already proven, the newest first. */
export function writeDeviceMarker(secret: string, existing: readonly string[], userId: string): string {
  const ids = [userId, ...existing.filter((id) => id !== userId)].slice(0, MAX_MARKED_OWNERS);
  return ids.map((id) => `${id}.${sign(secret, id)}`).join("~");
}

/** The cookie names, `__Secure-` over https: the marker is shared by the two hosts. */
export function deviceMarkerCookieName(config: Config): string {
  return config.APP_ORIGIN.startsWith("https://") ? `__Secure-${DEVICE_MARKER_COOKIE}` : DEVICE_MARKER_COOKIE;
}

/** The Set-Cookie header of the marker: HttpOnly, Lax, on COOKIE_DOMAIN when the hosts share it. */
export function deviceMarkerSetCookie(config: Config, value: string): string {
  const parts = [
    `${deviceMarkerCookieName(config)}=${value}`,
    "Path=/",
    `Max-Age=${DEVICE_MARKER_MAX_AGE}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (config.APP_ORIGIN.startsWith("https://")) parts.push("Secure");
  if (config.COOKIE_DOMAIN) parts.push(`Domain=${config.COOKIE_DOMAIN}`);
  return parts.join("; ");
}

/** One cookie of a Cookie header, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const index = pair.indexOf("=");
    if (index > 0 && pair.slice(0, index).trim() === name) return pair.slice(index + 1).trim();
  }
  return undefined;
}
