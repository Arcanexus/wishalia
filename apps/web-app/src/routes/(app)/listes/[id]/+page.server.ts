import { error } from "@sveltejs/kit";
import { appMessages } from "@wishalia/i18n/messages/app";

import { ApiError, apiJson } from "#lib/server/api.ts";
import {
  editItem,
  moveItem,
  orderItems,
  quickAdd,
  refreshItem,
  refreshList,
  setItemStatus,
} from "#lib/server/items.ts";
import { archiveList, revealList, saveListSettings } from "#lib/server/lists.ts";
import { giftsFor } from "#lib/server/events.ts";
import type { Gift, HistoryEntry, Item, List } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const { id } = event.params;
  // What the live page reloads when the worker moves on (docs/live-updates.md)
  event.depends("wishalia:list");
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
      error(404, appMessages(event.locals.locale).missing.list);
    }
    throw failure;
  }
  const list = lists.find((candidate) => candidate.id === id);
  if (!list) error(404, appMessages(event.locals.locale).missing.list);
  // A theme the owner forces on the list colours the whole page (docs/branding.md)
  event.locals.listTheme = list.theme;
  // The lists an item can move to
  const others = lists.filter((candidate) => !candidate.archivedAt);

  // Who gave what outside any event, where its secret is lifted: the whole list once the owner
  // lifted it, or each received item (the default). The API gives nothing before (anti-spoil).
  const lifted = items.filter((item) =>
    list.revealMode === "manual" ? list.secretLifted : item.status === "received",
  );
  const histories = await Promise.all(
    lifted.map((item) => apiJson<HistoryEntry[]>(event, `/manage/items/${item.id}/history`)),
  );
  const gifts: Record<string, Gift[]> = {};
  lifted.forEach((item, index) => (gifts[item.id] = giftsFor(histories[index] ?? [], null)));
  return { list, items, lists: others, gifts };
};

export const actions: Actions = {
  add: (event) => quickAdd(event, event.params.id),
  status: (event) => setItemStatus(event),
  edit: (event) => editItem(event),
  move: (event) => moveItem(event, event.params.id),
  order: (event) => orderItems(event, event.params.id),
  refresh: (event) => refreshItem(event),
  refreshAll: (event) => refreshList(event, event.params.id),
  settings: (event) => saveListSettings(event, event.params.id),
  reveal: (event) => revealList(event, event.params.id),
  archive: (event) => archiveList(event, event.params.id),
};
