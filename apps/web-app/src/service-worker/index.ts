/**
 * The service worker (docs/install.md). It makes the installed app start fast and say something
 * when the network is gone, and nothing more: it never keeps a page, an API answer or an image of
 * the person's lists, since those are private and change all the time.
 * - the app's code (/_app/immutable/, named after its content): from the cache once fetched;
 * - the static files (icons, the offline page): kept at install;
 * - a page: always from the network, the offline page when there is none.
 */
import { version } from "$app/env";
import { assets, immutable } from "$app/manifest";
import { self } from "$app/service-worker";

import { offlineFallback, strategy } from "../lib/offline.ts";

const CACHE = `wishalia-${version}`;
const files = assets.map((asset) => `/${asset.path}`);
const STATIC = new Set([...files, ...immutable.map((file) => `/${file.path}`)]);

self.addEventListener("install", (event) => {
  // Only the small static files: the code comes into the cache when a page asks for it
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(files))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const how = strategy(request.method, request.mode, new URL(request.url), self.location.origin, STATIC);
  if (how === "cache-first") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone());
        return response;
      }),
    );
  } else if (how === "page") {
    event.respondWith(
      fetch(request).catch(async () => (await caches.match(offlineFallback)) ?? Response.error()),
    );
  }
  // Anything else goes to the network as if there were no service worker
});
