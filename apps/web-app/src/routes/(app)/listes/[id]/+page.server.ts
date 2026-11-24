import { error } from "@sveltejs/kit";

import { ApiError, apiJson } from "#lib/server/api.ts";
import { editItem, quickAdd, setItemStatus } from "#lib/server/items.ts";
import type { Item, List } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { id } = event.params;
  let lists: List[];
  let items: Item[];
  try {
    [lists, items] = await Promise.all([
      apiJson<List[]>(event, "/manage/lists"),
      apiJson<Item[]>(event, `/manage/lists/${encodeURIComponent(id)}/items`),
    ]);
  } catch (failure) {
    // Someone else's list, a deleted one or a mistyped address: the same answer
    if (failure instanceof ApiError && (failure.status === 404 || failure.status === 400)) {
      error(404, "Cette liste n'existe pas, ou plus.");
    }
    throw failure;
  }
  const list = lists.find((candidate) => candidate.id === id);
  if (!list) error(404, "Cette liste n'existe pas, ou plus.");
  // A theme the owner forces on the list colours the whole page (docs/branding.md)
  event.locals.listTheme = list.theme;
  // The lists an item can move to
  const others = lists.filter((candidate) => !candidate.archivedAt);
  return { list, items, lists: others };
};

export const actions: Actions = {
  add: (event) => quickAdd(event, event.params.id),
  status: (event) => setItemStatus(event),
  edit: (event) => editItem(event),
};
