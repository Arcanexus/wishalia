import { fail, redirect } from "@sveltejs/kit";

import { ApiError, apiJson } from "#lib/server/api.ts";
import { quickAdd, setItemStatus } from "#lib/server/items.ts";
import type { List } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => ({
  lists: await apiJson<List[]>(event, "/manage/lists"),
});

export const actions: Actions = {
  add: (event) => quickAdd(event),
  status: (event) => setItemStatus(event),

  createList: async (event) => {
    const form = await event.request.formData();
    const name = String(form.get("name") ?? "").trim();
    if (!name || name.length > 100) return fail(400, { createList: { error: "invalid_name", name } });
    let list: List;
    try {
      list = await apiJson<List>(event, "/manage/lists", { method: "POST", body: { name } });
    } catch (failure) {
      if (failure instanceof ApiError)
        return fail(failure.status, { createList: { error: failure.code, name } });
      throw failure;
    }
    redirect(303, `/listes/${list.id}`);
  },
};
