import { json } from "@sveltejs/kit";

import { manifest } from "#lib/install.ts";

import type { RequestHandler } from "./$types";

/**
 * The web app manifest. A route and not a static file, for the name: APP_NAME. Browsers fetch it
 * without cookies, so it holds nothing about the person.
 */
export const GET: RequestHandler = () =>
  json(manifest(process.env.APP_NAME ?? "Wishalia"), {
    headers: { "content-type": "application/manifest+json", "cache-control": "public, max-age=3600" },
  });
