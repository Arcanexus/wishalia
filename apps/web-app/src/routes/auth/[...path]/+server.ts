import { proxyToApi } from "#lib/api.ts";

import type { RequestHandler } from "./$types";

// Sign-in, sign-out and sessions (Better Auth) live in the API: the cookies are set on this host
const handler: RequestHandler = ({ request, url, getClientAddress }) =>
  proxyToApi({ request, path: `${url.pathname}${url.search}`, clientAddress: getClientAddress() });

export const GET = handler;
export const POST = handler;
