import { error, type RequestEvent } from "@sveltejs/kit";

import type { PublicView } from "@wishalia/ui/public/types.ts";

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
