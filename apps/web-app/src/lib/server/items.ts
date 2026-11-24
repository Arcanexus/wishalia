import { fail, type RequestEvent } from "@sveltejs/kit";
import { cleanUrl, MAX_TITLE_LENGTH, parseAmount } from "@wishalia/domain";

import type { AddedItem, EditValues, Item, ItemStatus } from "#lib/types.ts";

import { ApiError, apiJson } from "./api.ts";

type FormEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies">;

const STATUSES: readonly ItemStatus[] = ["open", "received", "archived"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The quick add (spec §5.1): one field, a link and/or a few words. The API adds the item at once
 * and enriches it later; a link already in an open item is flagged, so the page offers to undo.
 */
export async function quickAdd(event: FormEvent, pageListId?: string) {
  const form = await event.request.formData();
  const input = String(form.get("input") ?? "").trim();
  // The list of the page, else the one the person picked (the share page), else the first one
  const listId = pageListId ?? (String(form.get("listId") ?? "") || undefined);
  if (listId !== undefined && !UUID.test(listId))
    return fail(400, { add: { error: "invalid_request", input } });
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

const KINDS = ["unique", "quantity", "pool"] as const;
/** The highest amount the API takes: a typo, not a price. */
const MAX_CENTS = 100_000_000;

/** An amount typed in euros (« 12,50 »), in cents; undefined when it is not one. */
function euros(text: string): number | null | undefined {
  if (!text) return null;
  const parsed = parseAmount(text);
  return parsed === null || parsed < 0 || parsed > MAX_CENTS ? undefined : parsed;
}

/**
 * Edits an item in place (spec §6): its words, its link, its price, what kind of gift it is, and
 * its list. The API writes the history (« updated », « price_changed », « moved »).
 */
export async function editItem(event: FormEvent) {
  const form = await event.request.formData();
  const text = (name: string) => String(form.get(name) ?? "").trim();
  const itemId = text("itemId");
  const values: EditValues = {
    title: text("title"),
    url: text("url"),
    price: text("price"),
    notes: text("notes"),
    kind: text("kind"),
    quantity: text("quantity"),
    target: text("target"),
    repeatable: form.get("repeatable") === "on",
    listId: text("listId"),
  };
  const refuse = (error: string) => fail(400, { edit: { itemId, error, values } });

  if (!UUID.test(itemId) || (values.listId && !UUID.test(values.listId))) return refuse("invalid_request");
  const kind = KINDS.find((candidate) => candidate === values.kind);
  if (!kind) return refuse("invalid_request");
  if (!values.title || values.title.length > MAX_TITLE_LENGTH) return refuse("invalid_title");
  const url = values.url ? cleanUrl(values.url) : null;
  if (values.url && url === null) return refuse("invalid_url");
  if (values.notes.length > 4000) return refuse("invalid_notes");
  const priceCents = euros(values.price);
  if (priceCents === undefined) return refuse("invalid_price");

  let quantity: number | null = null;
  let targetCents: number | null = null;
  if (kind === "quantity") {
    quantity = Number(values.quantity);
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 1000) return refuse("invalid_quantity");
  }
  if (kind === "pool") {
    const target = euros(values.target);
    if (target === undefined || target === 0) return refuse("invalid_target");
    targetCents = target;
  }

  try {
    const item = await apiJson<Item>(event, `/manage/items/${itemId}`, {
      method: "PATCH",
      body: {
        title: values.title,
        url,
        notes: values.notes || null,
        priceCents,
        kind,
        quantity,
        targetCents,
        // Only a gift can be given again at every occasion
        repeatable: kind === "unique" && values.repeatable,
        ...(values.listId ? { listId: values.listId } : {}),
      },
    });
    return { edit: { itemId: item.id, title: item.title, listId: item.listId } };
  } catch (failure) {
    if (failure instanceof ApiError)
      return fail(failure.status, { edit: { itemId, error: failure.code, values } });
    throw failure;
  }
}

/** Saves the order of a list's open items; 409 « order_changed » when the list changed meanwhile. */
async function saveOrder(event: FormEvent, listId: string, itemIds: string[]) {
  await apiJson<undefined>(event, `/manage/lists/${encodeURIComponent(listId)}/order`, {
    method: "PUT",
    body: { itemIds },
  });
}

const moveFailure = (failure: unknown) => {
  if (failure instanceof ApiError) return fail(failure.status, { move: { error: failure.code } });
  throw failure;
};

/**
 * Moves an item one place up or down among the list's open items: the buttons next to the drag
 * handle, which also work without JavaScript, with one tap and from the keyboard (WCAG 2.5.7).
 */
export async function moveItem(event: FormEvent, listId: string) {
  const form = await event.request.formData();
  const itemId = String(form.get("itemId") ?? "");
  const direction = String(form.get("direction") ?? "");
  if (!UUID.test(itemId) || (direction !== "up" && direction !== "down")) {
    return fail(400, { move: { error: "invalid_request" } });
  }
  try {
    const items = await apiJson<Item[]>(event, `/manage/lists/${encodeURIComponent(listId)}/items`);
    const open = items.filter((item) => item.status === "open");
    const from = open.findIndex((item) => item.id === itemId);
    const moving = open[from];
    if (!moving) return fail(409, { move: { error: "order_changed" } });
    const to = Math.min(open.length - 1, Math.max(0, from + (direction === "up" ? -1 : 1)));
    const order = open.map((item) => item.id);
    order.splice(from, 1);
    order.splice(to, 0, itemId);
    if (to !== from) await saveOrder(event, listId, order);
    return { move: { title: moving.title, position: to + 1, count: open.length } };
  } catch (failure) {
    return moveFailure(failure);
  }
}

/** Saves a whole new order, once an item is dropped where the person wants it. */
export async function orderItems(event: FormEvent, listId: string) {
  const form = await event.request.formData();
  const itemIds = form.getAll("itemIds").map(String);
  if (itemIds.length === 0 || !itemIds.every((id) => UUID.test(id))) {
    return fail(400, { move: { error: "invalid_request" } });
  }
  try {
    await saveOrder(event, listId, itemIds);
    return { move: { ordered: true } };
  } catch (failure) {
    return moveFailure(failure);
  }
}
