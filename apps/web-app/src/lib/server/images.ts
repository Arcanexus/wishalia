import { fail, type RequestEvent } from "@sveltejs/kit";
import { MAX_IMAGE_BYTES, normalizeCrop } from "@wishalia/domain";

import type { Item } from "#lib/types.ts";

import { ApiError, apiJson } from "./api.ts";

type FormEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies" | "locals">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The API's refusal, as the page words it (ImagePage). */
const refusal = (failure: unknown) => {
  if (failure instanceof ApiError) {
    const code =
      failure.status === 413 ? "too_heavy" : failure.status === 415 ? "not_an_image" : failure.code;
    return fail(failure.status, { image: { error: code } });
  }
  throw failure;
};

const patch = (event: FormEvent, itemId: string, body: object) =>
  apiJson<Item>(event, `/manage/items/${encodeURIComponent(itemId)}/image`, { method: "PATCH", body });

/**
 * The owner sends an image: a photo from the phone, a picture saved from a site. The file goes to
 * the API as it is; the API reads what it is from its bytes (docs/images.md).
 */
export async function uploadImage(event: FormEvent, itemId: string) {
  const form = await event.request.formData();
  const file = form.get("image");
  if (!(file instanceof File) || file.size === 0) return fail(400, { image: { error: "no_file" } });
  if (file.size > MAX_IMAGE_BYTES) return fail(413, { image: { error: "too_heavy" } });
  try {
    await apiJson<Item>(event, `/manage/items/${encodeURIComponent(itemId)}/image`, {
      method: "PUT",
      file: new Uint8Array(await file.arrayBuffer()),
    });
    return { image: { done: "uploaded" } };
  } catch (failure) {
    return refusal(failure);
  }
}

/** Shows one of the item's images: a proposal of the page, or the owner's own. */
export async function chooseImage(event: FormEvent, itemId: string) {
  const form = await event.request.formData();
  const imageId = String(form.get("imageId") ?? "");
  if (!UUID.test(imageId)) return fail(400, { image: { error: "invalid_request" } });
  try {
    await patch(event, itemId, { imageId });
    return { image: { done: "chosen" } };
  } catch (failure) {
    return refusal(failure);
  }
}

/** Saves the frame chosen in the image (fractions of its sides), or the whole image. */
export async function cropImage(event: FormEvent, itemId: string) {
  const form = await event.request.formData();
  if (form.get("whole") === "1") {
    try {
      await patch(event, itemId, { crop: null });
      return { image: { done: "whole" } };
    } catch (failure) {
      return refusal(failure);
    }
  }
  const value = (name: string) => Number(form.get(name) ?? Number.NaN);
  const frame = { x: value("x"), y: value("y"), width: value("width"), height: value("height") };
  if (!Object.values(frame).every(Number.isFinite)) return fail(400, { image: { error: "invalid_request" } });
  // A frame over the whole image is no frame
  const crop = normalizeCrop(frame);
  try {
    await patch(event, itemId, { crop });
    return { image: { done: crop ? "cropped" : "whole" } };
  } catch (failure) {
    return refusal(failure);
  }
}

/**
 * Removes the image the owner sent, for good: the page's first image shows again, and Wishalia
 * reads the link once more for fresh ones.
 */
export async function forgetUpload(event: FormEvent, itemId: string) {
  try {
    const item = await apiJson<Item>(event, `/manage/items/${encodeURIComponent(itemId)}/image/upload`, {
      method: "DELETE",
    });
    return { image: { done: item.url ? "forgotten" : "forgotten_no_link" } };
  } catch (failure) {
    return refusal(failure);
  }
}

/** Shows no image (the proposals stay, to choose again later). */
export async function removeImage(event: FormEvent, itemId: string) {
  try {
    await patch(event, itemId, { imageId: null });
    return { image: { done: "removed" } };
  } catch (failure) {
    return refusal(failure);
  }
}
