import { error } from "@sveltejs/kit";
import { appMessages } from "@wishalia/i18n/messages/app";

import { apiJson } from "#lib/server/api.ts";
import { chooseListIcon, forgetListImage, uploadListImage } from "#lib/server/list-pictures.ts";
import type { List } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

/** « Image de la liste »: the icon or the image shown next to its name (docs/list-pictures.md). */
export const load: PageServerLoad = async (event) => {
  const lists = await apiJson<List[]>(event, "/manage/lists");
  const list = lists.find((candidate) => candidate.id === event.params.id);
  if (!list) error(404, appMessages(event.locals.locale).missing.list);
  // The list's forced theme colours this page too: its icons are seen as the guests see them
  event.locals.listTheme = list.theme;
  return { list };
};

export const actions: Actions = {
  icon: (event) => chooseListIcon(event, event.params.id),
  upload: (event) => uploadListImage(event, event.params.id),
  forget: (event) => forgetListImage(event, event.params.id),
};
