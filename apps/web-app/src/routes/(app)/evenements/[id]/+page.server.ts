import { error, fail, type RequestEvent } from "@sveltejs/kit";

import { ApiError, apiJson } from "#lib/server/api.ts";
import { giftsFor, readEventForm } from "#lib/server/events.ts";
import type { Gift, HistoryEntry, Item, List, WishEvent } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NOT_FOUND = "Cet événement n'existe pas, ou plus.";

type ApiEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies" | "locals">;

/** The API's refusals become a message on the page; anything else is a real error. */
async function attempt<T>(key: string, run: () => Promise<T>) {
  try {
    return { value: await run() };
  } catch (failure) {
    if (failure instanceof ApiError)
      return { failure: fail(failure.status, { [key]: { error: failure.code } }) };
    throw failure;
  }
}

async function itemIdFrom(event: ApiEvent) {
  const itemId = String((await event.request.formData()).get("itemId") ?? "");
  return UUID.test(itemId) ? itemId : null;
}

export const load: PageServerLoad = async (event) => {
  const { id } = event.params;
  if (!UUID.test(id)) error(404, NOT_FOUND);
  const [events, lists] = await Promise.all([
    apiJson<WishEvent[]>(event, "/manage/events"),
    apiJson<List[]>(event, "/manage/lists"),
  ]);
  const found = events.find((candidate) => candidate.id === id);
  if (!found) error(404, NOT_FOUND);

  const [selected, ...byList] = await Promise.all([
    apiJson<Item[]>(event, `/manage/events/${id}/items`),
    ...lists.map((list) => apiJson<Item[]>(event, `/manage/lists/${list.id}/items`)),
  ]);
  const chosen = new Set(selected.map((item) => item.id));
  // What can still be chosen: the open items of each list, not already in the event
  const choices = lists
    .map((list, index) => ({
      list: { id: list.id, name: list.name },
      items: (byList[index] ?? []).filter((item) => item.status === "open" && !chosen.has(item.id)),
    }))
    .filter((group) => group.items.length > 0);

  // Who gave what: only once the secret is lifted, and the API gives nothing before (anti-spoil)
  const gifts: Record<string, Gift[]> = {};
  if (found.secretLifted) {
    const histories = await Promise.all(
      selected.map((item) => apiJson<HistoryEntry[]>(event, `/manage/items/${item.id}/history`)),
    );
    selected.forEach((item, index) => (gifts[item.id] = giftsFor(histories[index] ?? [], id)));
  }

  event.locals.christmas = found.kind === "christmas";
  return { event: found, selected, choices, gifts };
};

export const actions: Actions = {
  update: async (event) => {
    const { fields, failure, form } = await readEventForm(event, "update");
    if (failure) return failure;
    const frozen = form.get("frozen") === "1";
    // Once the secret is lifted the date and the delay are frozen: only the name and the type change
    const body = frozen ? { name: fields.name, kind: fields.kind } : fields;
    const result = await attempt("update", () =>
      apiJson<WishEvent>(event, `/manage/events/${event.params.id}`, { method: "PATCH", body }),
    );
    return result.failure ?? { update: { saved: true } };
  },

  addItem: async (event) => {
    const itemId = await itemIdFrom(event);
    if (!itemId) return fail(400, { items: { error: "invalid_request" } });
    const result = await attempt("items", () =>
      apiJson(event, `/manage/events/${event.params.id}/items/${itemId}`, { method: "PUT" }),
    );
    return result.failure ?? { items: { added: itemId } };
  },

  removeItem: async (event) => {
    const itemId = await itemIdFrom(event);
    if (!itemId) return fail(400, { items: { error: "invalid_request" } });
    const result = await attempt("items", () =>
      apiJson(event, `/manage/events/${event.params.id}/items/${itemId}`, { method: "DELETE" }),
    );
    return result.failure ?? { items: { removed: itemId } };
  },

  /** Final: from then on the owner sees who gave what for this event. */
  reveal: async (event) => {
    const form = await event.request.formData();
    if (form.get("confirm") !== "oui") return fail(400, { reveal: { error: "confirm" } });
    const result = await attempt("reveal", () =>
      apiJson<WishEvent>(event, `/manage/events/${event.params.id}/reveal`, { method: "POST" }),
    );
    return result.failure ?? { reveal: { lifted: true } };
  },
};
