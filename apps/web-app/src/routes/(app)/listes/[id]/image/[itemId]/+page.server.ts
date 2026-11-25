import { error } from "@sveltejs/kit";

import { ApiError, apiJson } from "#lib/server/api.ts";
import { chooseImage, cropImage, forgetUpload, removeImage, uploadImage } from "#lib/server/images.ts";
import type { Item, ItemImages, List } from "#lib/types.ts";

import type { Actions, PageServerLoad } from "./$types";

/** « Image »: the picture of an item, chosen among the page's, sent by the owner, framed. */
export const load: PageServerLoad = async (event) => {
  const { id, itemId } = event.params;
  let item: Item;
  let images: ItemImages;
  let lists: List[];
  try {
    [item, images, lists] = await Promise.all([
      apiJson<Item>(event, `/manage/items/${encodeURIComponent(itemId)}`),
      apiJson<ItemImages>(event, `/manage/items/${encodeURIComponent(itemId)}/images`),
      apiJson<List[]>(event, "/manage/lists"),
    ]);
  } catch (failure) {
    if (failure instanceof ApiError && (failure.status === 404 || failure.status === 400)) {
      error(404, "Cette envie n'existe pas, ou plus.");
    }
    throw failure;
  }
  // The address names the list too: an item of another list is not found here
  if (item.listId !== id) error(404, "Cette envie n'existe pas, ou plus.");
  // The list's forced theme colours this page too, as the list's own (docs/branding.md)
  event.locals.listTheme = lists.find((list) => list.id === id)?.theme ?? null;
  return { item, images };
};

export const actions: Actions = {
  upload: (event) => uploadImage(event, event.params.itemId),
  choose: (event) => chooseImage(event, event.params.itemId),
  crop: (event) => cropImage(event, event.params.itemId),
  remove: (event) => removeImage(event, event.params.itemId),
  forget: (event) => forgetUpload(event, event.params.itemId),
};
