import { error } from "@sveltejs/kit";
import { appMessages } from "@wishalia/i18n/messages/app";
import { samplePreview } from "@wishalia/ui/public/sample.ts";
import { sortForGuests } from "@wishalia/ui/public/view.ts";

import { ApiError, apiJson } from "#lib/server/api.ts";
import type { Item, List } from "#lib/types.ts";

import type { PageServerLoad } from "./$types";

/**
 * « Aperçu »: the list as the owner's relatives see it, with made-up contributions. Built from the
 * owner's own items only: no contribution is read, so nothing can be given away (CLAUDE.md, rule 1).
 */
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
    if (failure instanceof ApiError && (failure.status === 404 || failure.status === 400)) {
      error(404, appMessages(event.locals.locale).missing.list);
    }
    throw failure;
  }
  const list = lists.find((candidate) => candidate.id === id);
  if (!list) error(404, appMessages(event.locals.locale).missing.list);
  event.locals.listTheme = list.theme;
  return { list, items: sortForGuests(samplePreview(items, event.locals.locale)) };
};
