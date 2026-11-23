import type { FastifyReply, FastifyRequest } from "fastify";

import type { Config } from "../config.js";

/** The request headers as Web Headers, for Better Auth. */
export function toHeaders(request: FastifyRequest): Headers {
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    for (const item of Array.isArray(value) ? value : [value]) headers.append(name, item);
  }
  return headers;
}

/**
 * Turns a Fastify request into the Web Request Better Auth expects. The URL is built from
 * APP_ORIGIN, never from the Host header: the API is internal and the proxy decides the host.
 */
export function toWebRequest(request: FastifyRequest, config: Config): Request {
  const url = new URL(request.url, config.APP_ORIGIN);
  const hasBody = request.method !== "GET" && request.method !== "HEAD" && request.body !== undefined;
  return new Request(url, {
    method: request.method,
    headers: toHeaders(request),
    ...(hasBody
      ? { body: typeof request.body === "string" ? request.body : JSON.stringify(request.body) }
      : {}),
  });
}

/** Copies a Web Response to Fastify, every Set-Cookie included. */
export async function sendWebResponse(reply: FastifyReply, response: Response): Promise<FastifyReply> {
  reply.status(response.status);
  for (const [name, value] of response.headers) {
    if (name !== "set-cookie") reply.header(name, value);
  }
  const cookies = response.headers.getSetCookie();
  if (cookies.length > 0) reply.header("set-cookie", cookies);
  return reply.send(response.body ? Buffer.from(await response.arrayBuffer()) : null);
}
