import { fail, type RequestEvent } from "@sveltejs/kit";
import { isListIcon, MAX_IMAGE_BYTES } from "@wishalia/domain";

import type { List } from "#lib/types.ts";

import { ApiError, apiJson } from "./api.ts";

type FormEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies" | "locals">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The API's refusal, as the page words it (the list's picture page). */
const refusal = (failure: unknown) => {
  if (failure instanceof ApiError) {
    const code =
      failure.status === 413 ? "too_heavy" : failure.status === 415 ? "not_an_image" : failure.code;
    return fail(failure.status, { picture: { error: code } });
  }
  throw failure;
};

const listPath = (listId: string) => `/manage/lists/${encodeURIComponent(listId)}`;

/** Shows one of the icons next to the list's name (docs/list-pictures.md); the owner's image goes. */
export async function chooseListIcon(event: FormEvent, listId: string) {
  if (!UUID.test(listId)) return fail(400, { picture: { error: "invalid_request" } });
  const form = await event.request.formData();
  const icon = form.get("icon");
  if (!isListIcon(icon)) return fail(400, { picture: { error: "invalid_request" } });
  try {
    await apiJson<List>(event, listPath(listId), { method: "PATCH", body: { icon } });
    return { picture: { done: "icon" } };
  } catch (failure) {
    return refusal(failure);
  }
}

/**
 * The owner sends their own picture for the list: a photo, a drawing, a club's logo. The file goes
 * to the API as it is; the API reads what it is from its bytes (docs/images.md).
 */
export async function uploadListImage(event: FormEvent, listId: string) {
  if (!UUID.test(listId)) return fail(400, { picture: { error: "invalid_request" } });
  const form = await event.request.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return fail(400, { picture: { error: "no_file" } });
  if (file.size > MAX_IMAGE_BYTES) return fail(413, { picture: { error: "too_heavy" } });
  try {
    await apiJson<List>(event, `${listPath(listId)}/image`, {
      method: "PUT",
      file: new Uint8Array(await file.arrayBuffer()),
    });
    return { picture: { done: "uploaded" } };
  } catch (failure) {
    return refusal(failure);
  }
}

/** Removes the owner's picture, file included: the list's icon shows again. */
export async function forgetListImage(event: FormEvent, listId: string) {
  if (!UUID.test(listId)) return fail(400, { picture: { error: "invalid_request" } });
  try {
    await apiJson<List>(event, `${listPath(listId)}/image`, { method: "DELETE" });
    return { picture: { done: "forgotten" } };
  } catch (failure) {
    return refusal(failure);
  }
}
