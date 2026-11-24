import { error, redirect, type Cookies, type RequestEvent } from "@sveltejs/kit";

/**
 * Calls to the internal API, server side: the browser never reaches it (spec §8). The person's
 * cookies go along, so the API sees their session; the client address goes in X-Forwarded-For
 * for the rate limits.
 */

type ApiEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies">;

export function apiUrl(): string {
  const url =
    process.env.API_URL ?? (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000");
  if (!url) throw error(500, "API_URL is not set");
  return url;
}

export interface ApiCall {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  /** A file sent as it is (an image), instead of a JSON body. */
  file?: Uint8Array<ArrayBuffer>;
  fetch?: typeof fetch;
}

export async function apiFetch(event: ApiEvent, path: string, call: ApiCall = {}): Promise<Response> {
  const { method = "GET", body, file, fetch: send = fetch } = call;
  const headers = new Headers({ accept: "application/json", "x-forwarded-for": event.getClientAddress() });
  const cookie = event.request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  // Better Auth checks the origin of every state-changing call: the app's own
  headers.set("origin", event.url.origin);
  if (body !== undefined) headers.set("content-type", "application/json");
  // What the file is, the API reads from its bytes: never from what the browser said
  if (file !== undefined) headers.set("content-type", "application/octet-stream");
  return send(new URL(path, apiUrl()), {
    method,
    headers,
    redirect: "manual",
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    ...(file !== undefined ? { body: file } : {}),
  });
}

/** An error the API answered with: its status and its code. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/**
 * A JSON call to /manage. Without a session, the person goes to the sign-in page; any other
 * error is an ApiError the caller turns into a message.
 */
export async function apiJson<T>(event: ApiEvent, path: string, call: ApiCall = {}): Promise<T> {
  const response = await apiFetch(event, path, call);
  if (response.status === 401) {
    redirect(303, `/connexion?retour=${encodeURIComponent(event.url.pathname)}`);
  }
  if (response.status === 204) return undefined as T;
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  if (!response.ok) throw new ApiError(response.status, payload?.error ?? "unknown");
  return payload as T;
}

/** Passes the cookies an API answer sets on to the browser (sign-in, sign-out, device marker). */
export function forwardSetCookies(cookies: Cookies, response: Response): void {
  for (const header of response.headers.getSetCookie()) {
    const [pair = "", ...attributes] = header.split(";").map((part) => part.trim());
    const index = pair.indexOf("=");
    if (index <= 0) continue;
    const name = pair.slice(0, index);
    const value = pair.slice(index + 1);
    const options: Parameters<Cookies["set"]>[2] = { path: "/", encode: (raw) => raw, httpOnly: false };
    for (const attribute of attributes) {
      const [key = "", raw = ""] = attribute.split("=");
      switch (key.toLowerCase()) {
        case "path":
          options.path = raw;
          break;
        case "domain":
          options.domain = raw;
          break;
        case "max-age":
          options.maxAge = Number(raw);
          break;
        case "expires":
          options.expires = new Date(raw);
          break;
        case "httponly":
          options.httpOnly = true;
          break;
        case "secure":
          options.secure = true;
          break;
        case "samesite":
          options.sameSite = raw.toLowerCase() as "lax" | "strict" | "none";
          break;
      }
    }
    if (options.secure === undefined) options.secure = false;
    cookies.set(name, value, options);
  }
}

/** A path to go back to after signing in: only a path of this app, never another site. */
export function safeReturnPath(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") && !value.startsWith("/\\") ? value : "/";
}
