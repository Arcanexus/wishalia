/**
 * What the service worker does with a request (src/service-worker.ts). Pure, so that the rule that
 * matters most is tested: nothing private is ever put in the cache.
 */

/** The page shown by the installed app when there is no network: a static file, without data. */
export const offlineFallback = "/hors-ligne.html";

export type Strategy = "cache-first" | "page" | "network";

/**
 * - cache-first: the app's own code and static files, named after their content or fixed;
 * - page: a page of the app, from the network, with the offline page as a fallback;
 * - network: the rest (form posts, /img, the manifest, another site), left alone.
 */
export function strategy(
  method: string,
  mode: RequestMode,
  url: URL,
  origin: string,
  staticPaths: ReadonlySet<string>,
): Strategy {
  if (method !== "GET" || url.origin !== origin) return "network";
  if (mode === "navigate") return "page";
  if (staticPaths.has(url.pathname) && !url.search) return "cache-first";
  return "network";
}
