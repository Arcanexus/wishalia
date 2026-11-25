import { apiJson } from "#lib/server/api.ts";
import { commitImport, readSource } from "#lib/server/imports.ts";
import type { List } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

/** Importing a list from another service (docs/import.md): read, look, keep, add. */
export const load: PageServerLoad = async (event) => ({
  lists: await apiJson<List[]>(event, "/manage/lists"),
});

export const actions: Actions = {
  read: (event) => readSource(event),
  commit: (event) => commitImport(event),
};
