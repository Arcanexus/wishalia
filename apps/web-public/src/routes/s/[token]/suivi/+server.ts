import { json } from "@sveltejs/kit";

import { isWellFormedToken, publicFetch } from "#lib/server/api.ts";

import type { RequestHandler } from "./$types";

const notFound = () =>
  json({ error: "link_not_found" }, { status: 404, headers: { "cache-control": "no-store" } });

/**
 * What changed in the link's list, in a few bytes (docs/live-updates.md): the page asks it while
 * items are being completed, and loads itself again when the version moves. Only the version and
 * the count go to the browser, never cached.
 */
export const GET: RequestHandler = async (event) => {
  const { token } = event.params;
  if (!isWellFormedToken(token)) return notFound();
  const response = await publicFetch(event, token, "/public/live");
  if (response.status === 404) return notFound();
  if (!response.ok)
    return json({ error: "unavailable" }, { status: 503, headers: { "cache-control": "no-store" } });
  const { version, live } = (await response.json()) as { version: string; live: number };
  return json({ version, live }, { headers: { "cache-control": "private, no-store" } });
};
