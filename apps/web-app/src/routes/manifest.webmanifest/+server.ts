import { json } from "@sveltejs/kit";

import { manifest } from "#lib/install.ts";

import type { RequestHandler } from "./$types";

/**
 * The web app manifest. A route and not a static file, for the name (APP_NAME) and the language.
 * Browsers may fetch it without cookies, so it holds nothing about the person; the browser's
 * language decides then, and the cache keeps one copy per language.
 */
export const GET: RequestHandler = ({ locals }) =>
  json(manifest(process.env.APP_NAME ?? "Wishalia", locals.locale), {
    headers: {
      "content-type": "application/manifest+json",
      "cache-control": "public, max-age=3600",
      vary: "Accept-Language, Cookie",
    },
  });
