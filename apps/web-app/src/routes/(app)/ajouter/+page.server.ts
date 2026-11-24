import { sharedInput } from "@wishalia/domain";

import { apiJson } from "#lib/server/api.ts";
import { quickAdd, setItemStatus } from "#lib/server/items.ts";
import type { List } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

/**
 * Where the share menu lands (Web Share Target on Android, the Shortcut on iOS, docs/install.md):
 * /ajouter?title=…&text=…&url=…. Opening the page never adds anything, so that no other site can
 * add a wish by sending someone here: it fills the field, and the person adds with one tap.
 */
export const load: PageServerLoad = async (event) => {
  const query = event.url.searchParams;
  return {
    lists: await apiJson<List[]>(event, "/manage/lists"),
    input: sharedInput({ title: query.get("title"), text: query.get("text"), url: query.get("url") }),
  };
};

export const actions: Actions = {
  add: (event) => quickAdd(event),
  status: (event) => setItemStatus(event),
};
