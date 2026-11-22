import { genericMeta } from "#lib/meta.ts";

import type { PageServerLoad } from "./$types";

// adapter-node runs on Node.js: the configuration is read from the environment at request time
export const load: PageServerLoad = () => ({
  meta: genericMeta(process.env.WISHLIST_APP_NAME ?? "wishlist"),
});
