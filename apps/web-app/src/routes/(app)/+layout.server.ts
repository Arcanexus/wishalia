import { apiJson } from "#lib/server/api.ts";
import type { Me } from "#lib/types.ts";

import type { LayoutServerLoad } from "./$types";

/** Every page of the app needs a session: without one, apiJson sends the person to /connexion. */
export const load: LayoutServerLoad = async (event) => ({
  me: await apiJson<Me>(event, "/manage/me"),
});
