import { error, type RequestEvent } from "@sveltejs/kit";

import type { GoneGift, PublicView } from "@wishalia/ui/public/types.ts";

/**
 * Calls to the internal API, server side: the browser never reaches it (spec §8). The share token
 * goes in a header, never in the URL, so that it stays out of the API's access logs. The cookies go
 * along: the session and the owner's device marker tell the API who is looking.
 */

type ApiEvent = Pick<RequestEvent, "request" | "getClientAddress">;

/** A share token as the management app makes them: 32 random bytes in base64url. */
export const isWellFormedToken = (value: string) => /^[A-Za-z0-9_-]{43}$/.test(value);

export function apiUrl(): string {
  const url =
    process.env.API_URL ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!url) throw error(500, "API_URL is not set");
  return url;
}

export interface PublicCall {
  method?: "GET" | "POST" | "DELETE";
  body?: unknown;
  headers?: Record<string, string>;
}

export async function publicFetch(
  event: ApiEvent,
  token: string,
  path: string,
  { method = "GET", body, headers: extra = {} }: PublicCall = {},
): Promise<Response> {
  const headers = new Headers({
    accept: "application/json",
    "x-share-token": token,
    "x-forwarded-for": event.getClientAddress(),
    ...extra,
  });
  const cookie = event.request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  return fetch(new URL(path, apiUrl()), {
    method,
    headers,
    redirect: "manual",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
}

/**
 * What the link opens, or null when it opens nothing: unknown, revoked or expired, the API
 * answers the same for the three, and so does this page.
 */
export async function loadView(event: ApiEvent, token: string): Promise<PublicView | null> {
  if (!isWellFormedToken(token)) return null;
  const response = await publicFetch(event, token, "/public/view");
  if (response.status === 404) return null;
  if (!response.ok) throw error(503, "unavailable");
  return (await response.json()) as PublicView;
}

/**
 * The person's own gifts whose item left the list, archived or deleted, so that the page tells
 * them not to buy it. Asked with the withdraw keys of this device (never shown to the page) and
 * the account's session. Nothing to ask without either; a failure only leaves the notice out.
 */
export async function loadGone(
  event: ApiEvent,
  token: string,
  kept: { id: string; key: string }[],
  signedIn: boolean,
): Promise<GoneGift[]> {
  if (kept.length === 0 && !signedIn) return [];
  const response = await publicFetch(event, token, "/public/gifts/gone", {
    method: "POST",
    body: { gifts: kept.map(({ id, key }) => ({ id, key })) },
  });
  if (!response.ok) return [];
  return (await response.json()) as GoneGift[];
}

/** A public list, as the home page's search gives it: never anything about a gift. */
export interface PublicListEntry {
  name: string;
  ownerName: string;
  itemCount: number;
  /** The open link: /s/<token>. */
  path: string;
}

export interface HomeData {
  me: { displayName: string } | null;
  /** The search as the API understood it; empty when it lists everything. */
  query: string;
  lists: PublicListEntry[];
  more: boolean;
}

/**
 * The home page's data: who is signed in, and the public lists (only those, whatever the search).
 * The session cookie goes along; no share token is involved.
 */
export async function loadHome(event: ApiEvent, query: string): Promise<HomeData> {
  const url = new URL("/public/home", apiUrl());
  if (query) url.searchParams.set("q", query.slice(0, 200));
  const headers = new Headers({ accept: "application/json", "x-forwarded-for": event.getClientAddress() });
  const cookie = event.request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const response = await fetch(url, { headers, redirect: "manual" });
  if (!response.ok) throw error(503, "unavailable");
  const data = (await response.json()) as HomeData;
  // Only addresses of this host: a result never sends anyone elsewhere
  return { ...data, lists: data.lists.filter((list) => /^\/s\/[A-Za-z0-9_-]{43}$/.test(list.path)) };
}

/**
 * The token of a share link the person pasted: the whole address (any host, since it may come
 * from a message) or the token alone. Null when it holds none.
 */
export function tokenFromPasted(pasted: string): string | null {
  const text = pasted.trim();
  if (isWellFormedToken(text)) return text;
  const match = /\/s\/([A-Za-z0-9_-]{43})(?:[/?#]|$)/.exec(text);
  return match?.[1] ?? null;
}

/**
 * The management app's address, for « Se connecter » and « Mes listes ». adapter-node runs on
 * Node.js: the configuration is read from the environment at request time.
 */
export function appOrigin(): string | null {
  const value =
    process.env.APP_ORIGIN ?? (process.env.NODE_ENV === "production" ? "" : "http://localhost:3003");
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.origin : null;
  } catch {
    return null;
  }
}
