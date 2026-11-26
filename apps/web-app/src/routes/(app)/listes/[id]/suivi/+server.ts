import { json } from "@sveltejs/kit";

import { apiFetch } from "#lib/server/api.ts";

import type { RequestHandler } from "./$types";

const noStore = { "cache-control": "private, no-store" };

/**
 * What changed in the list, in a few bytes (docs/live-updates.md): the page asks it while the
 * worker completes items, and loads the list again when the version moves. A plain status for a
 * script, never the sign-in page: the page's own load sends there when it reloads.
 */
export const GET: RequestHandler = async (event) => {
  const response = await apiFetch(event, `/manage/lists/${encodeURIComponent(event.params.id)}/live`);
  if (response.status === 401) return json({ error: "unauthenticated" }, { status: 401, headers: noStore });
  if (response.status === 404 || response.status === 400) {
    return json({ error: "not_found" }, { status: 404, headers: noStore });
  }
  if (!response.ok) return json({ error: "unavailable" }, { status: 503, headers: noStore });
  const { version, live } = (await response.json()) as { version: string; live: number };
  return json({ version, live }, { headers: noStore });
};
