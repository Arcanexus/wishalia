import type { Cookies } from "@sveltejs/kit";

/**
 * What a guest without an account gave through a link, kept on their device so that they can see
 * it and withdraw it. The withdraw key the API gave once is the only proof that the gift is theirs:
 * an HttpOnly cookie, scoped to the link's path, never sent to the page's JavaScript.
 */

export const GIFTS_COOKIE = "wishalia.gifts";
export const NAME_COOKIE = "wishalia.guest_name";
const MAX_AGE = 400 * 24 * 3600;
/** A cookie holds about 4 KB: the oldest gifts go first past this many. */
const MAX_GIFTS = 30;

export interface StoredGift {
  id: string;
  itemId: string;
  eventId: string | null;
  amountCents: number | null;
  units: number | null;
  key: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[A-Za-z0-9_-]{43}$/;
const optionalNumber = (value: unknown) =>
  value === null || (Number.isSafeInteger(value) && (value as number) > 0);

function isGift(value: unknown): value is StoredGift {
  if (typeof value !== "object" || value === null) return false;
  const gift = value as Record<string, unknown>;
  return (
    typeof gift.id === "string" &&
    UUID.test(gift.id) &&
    typeof gift.itemId === "string" &&
    UUID.test(gift.itemId) &&
    (gift.eventId === null || (typeof gift.eventId === "string" && UUID.test(gift.eventId))) &&
    optionalNumber(gift.amountCents) &&
    optionalNumber(gift.units) &&
    typeof gift.key === "string" &&
    KEY.test(gift.key)
  );
}

/** The gifts kept on this device; anything malformed is dropped. */
export function readGifts(cookies: Cookies): StoredGift[] {
  const raw = cookies.get(GIFTS_COOKIE);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(Buffer.from(raw, "base64url").toString("utf8"));
    return Array.isArray(parsed) ? parsed.filter(isGift) : [];
  } catch {
    return [];
  }
}

export function writeGifts(cookies: Cookies, token: string, gifts: StoredGift[], secure: boolean): void {
  const path = `/s/${token}`;
  if (gifts.length === 0) {
    cookies.delete(GIFTS_COOKIE, { path, secure });
    return;
  }
  const value = Buffer.from(JSON.stringify(gifts.slice(-MAX_GIFTS))).toString("base64url");
  cookies.set(GIFTS_COOKIE, value, { path, maxAge: MAX_AGE, httpOnly: true, sameSite: "lax", secure });
}

/** The name the guest gave last time, to fill the field in. */
export function readGuestName(cookies: Cookies): string {
  return (cookies.get(NAME_COOKIE) ?? "").slice(0, 60);
}

export function writeGuestName(cookies: Cookies, name: string, secure: boolean): void {
  cookies.set(NAME_COOKIE, name, { path: "/", maxAge: MAX_AGE, httpOnly: true, sameSite: "lax", secure });
}

/**
 * A visitor without an account has said they are not the owner: what others give shows on this
 * link. Until then it stays folded, in case the device is the owner's (spec: « visiteur non
 * identifié → les participations restent repliées derrière un clic de confirmation »).
 */
export const UNFOLDED_COOKIE = "wishalia.unfolded";

export const readUnfolded = (cookies: Cookies) => cookies.get(UNFOLDED_COOKIE) === "1";

export function writeUnfolded(cookies: Cookies, token: string, secure: boolean): void {
  cookies.set(UNFOLDED_COOKIE, "1", {
    path: `/s/${token}`,
    maxAge: MAX_AGE,
    httpOnly: true,
    sameSite: "lax",
    secure,
  });
}
