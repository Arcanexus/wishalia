/** Request headers passed on to the API: what Better Auth needs, nothing else. */
const FORWARDED = ["accept", "accept-language", "content-type", "cookie", "origin", "user-agent"];

export interface ProxyInput {
  request: Request;
  /** The path on the API, query string included: /auth/sign-in/magic-link?x=1 */
  path: string;
  clientAddress: string;
  apiUrl?: string | undefined;
  fetch?: typeof fetch;
}

/**
 * Forwards a request to the internal API and hands its answer back, Set-Cookie and redirects
 * included. The browser never reaches the API: the management app does, server side (spec §8).
 */
export async function proxyToApi({
  request,
  path,
  clientAddress,
  // pnpm dev: the API on its default port
  apiUrl = process.env.API_URL ??
    (process.env.NODE_ENV === "production" ? undefined : "http://localhost:3000"),
  fetch: send = fetch,
}: ProxyInput): Promise<Response> {
  if (!apiUrl) {
    return new Response("API_URL is not set", { status: 500 });
  }
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = request.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  // The API rate-limits by client address: the real one, never a header sent by the browser
  headers.set("x-forwarded-for", clientAddress);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";
  const response = await send(new URL(path, apiUrl), {
    method: request.method,
    headers,
    redirect: "manual",
    ...(hasBody ? { body: await request.arrayBuffer() } : {}),
  });

  const out = new Headers();
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie" && name !== "content-length" && name !== "content-encoding")
      out.set(name, value);
  }
  for (const cookie of response.headers.getSetCookie()) out.append("set-cookie", cookie);
  return new Response(response.body, { status: response.status, headers: out });
}
