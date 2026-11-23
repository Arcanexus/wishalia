import type { Cookies } from "@sveltejs/kit";
import { vi } from "vitest";

/** A fake API: answers by "METHOD /path", records every call. */
export function fakeApi(routes: Record<string, (body: unknown) => Response>) {
  const calls: { method: string; path: string; headers: Headers; body: unknown }[] = [];
  const fetch = vi.fn(async (url: URL | string, init: RequestInit = {}) => {
    const target = new URL(url);
    const method = init.method ?? "GET";
    const body = typeof init.body === "string" ? JSON.parse(init.body) : undefined;
    calls.push({ method, path: target.pathname, headers: new Headers(init.headers), body });
    const route = routes[`${method} ${target.pathname}`];
    return route ? route(body) : json({ error: "not_found" }, 404);
  });
  vi.stubGlobal("fetch", fetch);
  return { calls };
}

export const json = (payload: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", ...Object.fromEntries(new Headers(headers)) },
  });

/** The cookies of a request, and what the handler sets. */
export function fakeCookies(initial: Record<string, string> = {}) {
  const jar = new Map(Object.entries(initial));
  const set: { name: string; value: string; options: Parameters<Cookies["set"]>[2] }[] = [];
  const cookies = {
    get: (name: string) => jar.get(name),
    getAll: () => [...jar].map(([name, value]) => ({ name, value })),
    set: (name: string, value: string, options: Parameters<Cookies["set"]>[2]) => {
      jar.set(name, value);
      set.push({ name, value, options });
    },
    delete: (name: string) => void jar.delete(name),
    serialize: () => "",
  } as unknown as Cookies;
  return { cookies, set };
}

export interface EventInput {
  url?: string;
  method?: string;
  form?: Record<string, string>;
  cookie?: string;
  params?: Record<string, string>;
  cookies?: Record<string, string>;
}

/** Just enough of a SvelteKit request event for a load, an action or an endpoint. */
export function fakeEvent({
  url = "https://app.test/",
  method,
  form,
  cookie,
  params = {},
  cookies,
}: EventInput = {}) {
  const headers = new Headers(cookie ? { cookie } : {});
  const request = new Request(url, {
    method: method ?? (form ? "POST" : "GET"),
    headers,
    ...(form ? { body: new URLSearchParams(form) } : {}),
  });
  const jar = fakeCookies(cookies);
  const event = {
    request,
    url: new URL(url),
    params,
    cookies: jar.cookies,
    getClientAddress: () => "10.0.0.7",
    locals: { themeChoice: "auto", mode: "device", listTheme: null, christmas: false } as App.Locals,
  };
  return { event, setCookies: jar.set };
}

/** What a thrown redirect or error carries, or the value a handler returned. */
export async function outcome<T>(run: () => T | Promise<T>) {
  try {
    return { value: await run() };
  } catch (thrown) {
    return { thrown: thrown as { status: number; location?: string; body?: { message: string } } };
  }
}
