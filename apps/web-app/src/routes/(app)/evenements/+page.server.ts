import { fail, redirect } from "@sveltejs/kit";

import { ApiError, apiJson } from "#lib/server/api.ts";
import { readEventForm } from "#lib/server/events.ts";
import type { WishEvent } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => ({
  events: await apiJson<WishEvent[]>(event, "/manage/events"),
});

export const actions: Actions = {
  create: async (event) => {
    const { fields, failure } = await readEventForm(event, "create");
    if (failure) return failure;
    let created: WishEvent;
    try {
      created = await apiJson<WishEvent>(event, "/manage/events", { method: "POST", body: fields });
    } catch (error) {
      if (error instanceof ApiError) return fail(error.status, { create: { error: error.code, ...fields } });
      throw error;
    }
    redirect(303, `/evenements/${created.id}`);
  },
};
