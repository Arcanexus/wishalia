import { fail, type RequestEvent } from "@sveltejs/kit";
import { cleanUrl, MAX_TITLE_LENGTH, parseAmount } from "@wishalia/domain";

import type { AddedItem, EditValues, Item, ItemStatus } from "#lib/types.ts";

import { ApiError, apiJson } from "./api.ts";

type FormEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies" | "locals">;

const STATUSES: readonly ItemStatus[] = ["open", "received", "archived"];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The quick add (spec §5.1): one field, a link and/or a few words. The API adds the item at once
 * and enriches it later; a link already in an open item is flagged, so the page offers to undo.
 */
export async function quickAdd(event: FormEvent, pageListId?: string) {
  const form = await event.request.formData();
  const input = String(form.get("input") ?? "").trim();
  // Into a series (docs/series.md): its last volume, in its list
  const parentId = String(form.get("parentId") ?? "") || undefined;
  if (parentId !== undefined) {
    if (!UUID.test(parentId)) return fail(400, { add: { error: "invalid_request", input, parentId } });
    if (!input) return fail(400, { add: { error: "empty", input, parentId } });
    try {
      const added = await apiJson<AddedItem>(event, "/manage/items", {
        method: "POST",
        body: { input, parentId },
      });
      return { volume: { seriesId: parentId, title: added.title } };
    } catch (failure) {
      if (failure instanceof ApiError)
        return fail(failure.status, { add: { error: failure.code, input, parentId } });
      throw failure;
    }
  }
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

/**
 * Deletes an item for good, after the dialog's confirmation. The API cancels what guests had
 * pledged to it and tells them, never the owner (anti-spoil).
 */
export async function deleteItem(event: FormEvent) {
  const form = await event.request.formData();
  const itemId = String(form.get("itemId") ?? "");
  const title = String(form.get("title") ?? "").slice(0, MAX_TITLE_LENGTH);
  if (!UUID.test(itemId)) return fail(400, { remove: { error: "invalid_request" } });
  if (form.get("confirm") !== "oui") return fail(400, { remove: { error: "confirm" } });
  try {
    await apiJson<undefined>(event, `/manage/items/${itemId}`, { method: "DELETE" });
    return { remove: { itemId, title } };
  } catch (failure) {
    if (failure instanceof ApiError) return fail(failure.status, { remove: { error: failure.code } });
    throw failure;
  }
}

const KINDS = ["unique", "quantity", "pool", "series"] as const;
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
  if (values.notes.length > 4000) return refuse("invalid_notes");
  if (kind === "series") return editSeries(event, itemId, form.get("series") === "1", values, refuse);
  const url = values.url ? cleanUrl(values.url) : null;
  if (values.url && url === null) return refuse("invalid_url");
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

/**
 * « Une série » chosen (docs/series.md). For the series itself, its name and notes are saved; for a
 * wish of its own, it becomes the first volume of a new series, named after it.
 */
async function editSeries<F>(
  event: FormEvent,
  itemId: string,
  isSeries: boolean,
  values: EditValues,
  refuse: (error: string) => F,
) {
  try {
    if (isSeries) {
      const series = await apiJson<Item>(event, `/manage/items/${itemId}`, {
        method: "PATCH",
        // A series goes to another list with all its volumes
        body: {
          title: values.title,
          notes: values.notes || null,
          ...(values.listId ? { listId: values.listId } : {}),
        },
      });
      return { edit: { itemId: series.id, title: series.title, listId: series.listId } };
    }
    const item = await apiJson<Item>(event, `/manage/items/${itemId}`);
    const series = await apiJson<Item>(event, `/manage/lists/${encodeURIComponent(item.listId)}/series`, {
      method: "POST",
      body: { itemIds: [itemId] },
    });
    return { edit: { itemId, title: item.title, listId: item.listId, seriesId: series.id } };
  } catch (failure) {
    if (failure instanceof ApiError)
      return refuse(failure.code === "invalid_request" ? "invalid_request" : failure.code);
    throw failure;
  }
}

/** The answer of a change to a series, or its failure. */
const seriesFailure = (failure: unknown) => {
  if (failure instanceof ApiError) return fail(failure.status, { series: { error: failure.code } });
  throw failure;
};

/**
 * Puts the wishes ticked into a series, as its last volumes (« Ranger dans la série »).
 */
export async function gatherVolumes(event: FormEvent) {
  const form = await event.request.formData();
  const seriesId = String(form.get("seriesId") ?? "");
  const title = String(form.get("title") ?? "").slice(0, MAX_TITLE_LENGTH);
  const itemIds = form.getAll("itemIds").map(String);
  if (!UUID.test(seriesId) || !itemIds.every((id) => UUID.test(id))) {
    return fail(400, { series: { error: "invalid_request" } });
  }
  if (itemIds.length === 0) return { series: { seriesId, gathered: 0, title } };
  try {
    const { added } = await apiJson<{ added: number }>(event, `/manage/items/${seriesId}/volumes`, {
      method: "POST",
      body: { itemIds },
    });
    return { series: { seriesId, gathered: added, title } };
  } catch (failure) {
    return seriesFailure(failure);
  }
}

/** Takes a volume out of its series: a wish of its own again, first in the list. */
export async function takeOutVolume(event: FormEvent) {
  const form = await event.request.formData();
  const itemId = String(form.get("itemId") ?? "");
  if (!UUID.test(itemId)) return fail(400, { series: { error: "invalid_request" } });
  try {
    const item = await apiJson<Item>(event, `/manage/items/${itemId}`, {
      method: "PATCH",
      body: { parentId: null },
    });
    return { series: { takenOut: item.title } };
  } catch (failure) {
    return seriesFailure(failure);
  }
}

/** Undoes a series: its volumes go back into the list where it stood. */
export async function ungroupSeries(event: FormEvent) {
  const form = await event.request.formData();
  const itemId = String(form.get("itemId") ?? "");
  const title = String(form.get("title") ?? "").slice(0, MAX_TITLE_LENGTH);
  if (!UUID.test(itemId)) return fail(400, { series: { error: "invalid_request" } });
  try {
    await apiJson<undefined>(event, `/manage/items/${itemId}/ungroup`, { method: "POST" });
    return { series: { ungrouped: title } };
  } catch (failure) {
    return seriesFailure(failure);
  }
}

/** Moves a volume one place up or down in its series, as the arrows of the list do. */
export async function moveVolume(event: FormEvent, listId: string) {
  const form = await event.request.formData();
  const itemId = String(form.get("itemId") ?? "");
  const direction = String(form.get("direction") ?? "");
  if (!UUID.test(itemId) || (direction !== "up" && direction !== "down")) {
    return fail(400, { move: { error: "invalid_request" } });
  }
  try {
    const items = await apiJson<Item[]>(event, `/manage/lists/${encodeURIComponent(listId)}/items`);
    const moving = items.find((item) => item.id === itemId && item.status === "open");
    if (!moving?.parentId) return fail(409, { move: { error: "order_changed" } });
    const open = items
      .filter((item) => item.parentId === moving.parentId && item.status === "open")
      .sort((a, b) => a.position - b.position);
    const from = open.findIndex((item) => item.id === itemId);
    const to = Math.min(open.length - 1, Math.max(0, from + (direction === "up" ? -1 : 1)));
    const order = open.map((item) => item.id);
    order.splice(from, 1);
    order.splice(to, 0, itemId);
    if (to !== from) {
      await apiJson<undefined>(event, `/manage/items/${moving.parentId}/order`, {
        method: "PUT",
        body: { itemIds: order },
      });
    }
    return { move: { title: moving.title, position: to + 1, count: open.length } };
  } catch (failure) {
    return moveFailure(failure);
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
    // The list's own wishes: a series moves as one, its volumes stay inside it
    const open = items.filter((item) => item.status === "open" && !item.parentId);
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

/**
 * Reads an item's link again (docs/enrichment.md): the title, the price and the images come
 * back from the page, while the owner's own words and photo stay. The page then shows
 * « Lecture du lien… » as for a new item.
 */
export async function refreshItem(event: FormEvent) {
  const form = await event.request.formData();
  const itemId = String(form.get("itemId") ?? "");
  if (!UUID.test(itemId)) return fail(400, { refresh: { error: "invalid_request" } });
  try {
    const item = await apiJson<Item>(event, `/manage/items/${itemId}/refresh`, { method: "POST" });
    return { refresh: { itemId: item.id, title: item.title } };
  } catch (failure) {
    if (failure instanceof ApiError)
      return fail(failure.status, { refresh: { error: failure.code, itemId } });
    throw failure;
  }
}

/** Reads the links of every open item of the list again, one site at a time. */
export async function refreshList(event: FormEvent, listId: string) {
  try {
    const { queued } = await apiJson<{ queued: number }>(
      event,
      `/manage/lists/${encodeURIComponent(listId)}/refresh`,
      { method: "POST" },
    );
    return { refresh: { queued } };
  } catch (failure) {
    if (failure instanceof ApiError) return fail(failure.status, { refresh: { error: failure.code } });
    throw failure;
  }
}
