import { fail, type RequestEvent } from "@sveltejs/kit";

import type { AddedItem, Item, ItemStatus } from "#lib/types.ts";

import { ApiError, apiJson } from "./api.ts";

type FormEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies">;

const STATUSES: readonly ItemStatus[] = ["open", "received", "archived"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The quick add (spec §5.1): one field, a link and/or a few words. The API adds the item at once
 * and enriches it later; a link already in an open item is flagged, so the page offers to undo.
 */
export async function quickAdd(event: FormEvent, listId?: string) {
  const form = await event.request.formData();
  const input = String(form.get("input") ?? "").trim();
  if (!input) return fail(400, { add: { error: "empty", input } });
  try {
    const added = await apiJson<AddedItem>(event, "/manage/items", {
      method: "POST",
      body: { input, ...(listId ? { listId } : {}) },
    });
    return {
      add: {
        item: { id: added.id, title: added.title, listId: added.listId },
        duplicate: added.duplicateOf.length > 0,
      },
    };
  } catch (failure) {
    if (failure instanceof ApiError) return fail(failure.status, { add: { error: failure.code, input } });
    throw failure;
  }
}

/** Marks an item received, archives it, or opens it again. Each change lands in its history. */
export async function setItemStatus(event: FormEvent) {
  const form = await event.request.formData();
  const itemId = String(form.get("itemId") ?? "");
  const status = String(form.get("status") ?? "") as ItemStatus;
  if (!UUID.test(itemId) || !STATUSES.includes(status)) {
    return fail(400, { status: { error: "invalid_request" } });
  }
  try {
    const item = await apiJson<Item>(event, `/manage/items/${itemId}`, { method: "PATCH", body: { status } });
    return { status: { itemId: item.id, title: item.title, status: item.status } };
  } catch (failure) {
    if (failure instanceof ApiError) return fail(failure.status, { status: { error: failure.code } });
    throw failure;
  }
}
