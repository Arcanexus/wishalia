import { fail, redirect, type RequestEvent } from "@sveltejs/kit";

import type { List } from "#lib/types.ts";

import { ApiError, apiJson } from "./api.ts";

type FormEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies" | "locals">;

const THEMES = ["none", "neutral", "christmas"] as const;
const REVEAL_MODES = ["received", "manual"] as const;
const VISIBILITIES = ["private", "public"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Runs a call to the API; its refusal comes back as a code, anything else is a real error. */
async function refusal(run: () => Promise<unknown>): Promise<{ status: number; code: string } | null> {
  try {
    await run();
    return null;
  } catch (failure) {
    if (failure instanceof ApiError) return { status: failure.status, code: failure.code };
    throw failure;
  }
}

/**
 * A list's settings: its name, who finds it (private or public), the theme forced on everyone who
 * opens it, and how the secret of the gifts without an event lifts (frozen by the API once lifted).
 */
export async function saveListSettings(event: FormEvent, listId: string) {
  if (!UUID.test(listId)) return fail(400, { settings: { error: "invalid_request" } });
  const form = await event.request.formData();
  const name = String(form.get("name") ?? "").trim();
  const theme = THEMES.find((value) => value === form.get("theme"));
  const revealMode = REVEAL_MODES.find((value) => value === form.get("revealMode"));
  const visibility = VISIBILITIES.find((value) => value === form.get("visibility"));
  if (!name || name.length > 100) return fail(400, { settings: { error: "invalid_name", name } });
  if (!theme) return fail(400, { settings: { error: "invalid_request", name } });
  const refused = await refusal(() =>
    apiJson<List>(event, `/manage/lists/${listId}`, {
      method: "PATCH",
      body: {
        name,
        theme: theme === "none" ? null : theme,
        ...(revealMode ? { revealMode } : {}),
        ...(visibility ? { visibility } : {}),
      },
    }),
  );
  if (refused) return fail(refused.status, { settings: { error: refused.code, name } });
  return { settings: { saved: true } };
}

/** Lifts the secret of the gifts without an event, for good: only after a ticked confirmation. */
export async function revealList(event: FormEvent, listId: string) {
  if (!UUID.test(listId)) return fail(400, { reveal: { error: "invalid_request" } });
  const form = await event.request.formData();
  if (form.get("confirm") !== "oui") return fail(400, { reveal: { error: "confirm" } });
  const refused = await refusal(() =>
    apiJson<List>(event, `/manage/lists/${listId}/reveal`, { method: "POST" }),
  );
  if (refused) return fail(refused.status, { reveal: { error: refused.code } });
  return { reveal: { lifted: true } };
}

/** Archives the list after a ticked confirmation, then goes back to the lists. */
export async function archiveList(event: FormEvent, listId: string) {
  if (!UUID.test(listId)) return fail(400, { archive: { error: "invalid_request" } });
  const form = await event.request.formData();
  if (form.get("confirm") !== "oui") return fail(400, { archive: { error: "confirm" } });
  const refused = await refusal(() =>
    apiJson<List>(event, `/manage/lists/${listId}`, { method: "PATCH", body: { archived: true } }),
  );
  if (refused) return fail(refused.status, { archive: { error: refused.code } });
  redirect(303, "/?archivee=1");
}

/** Brings an archived list back, as it was: to the owner's lists and to its share links. */
export async function restoreList(event: FormEvent) {
  const form = await event.request.formData();
  const listId = String(form.get("listId") ?? "");
  if (!UUID.test(listId)) return fail(400, { restore: { error: "invalid_request" } });
  try {
    const list = await apiJson<List>(event, `/manage/lists/${listId}`, {
      method: "PATCH",
      body: { archived: false },
    });
    return { restore: { listId: list.id, name: list.name } };
  } catch (failure) {
    if (failure instanceof ApiError) return fail(failure.status, { restore: { error: failure.code } });
    throw failure;
  }
}

/**
 * Deletes a list for good, with its items, after a confirmation (the dialog's, or the ticked box
 * of the list's settings), then goes back to the lists. The list comes from the page, or from the
 * form on the home page.
 */
export async function deleteList(event: FormEvent, pageListId?: string) {
  const form = await event.request.formData();
  const listId = pageListId ?? String(form.get("listId") ?? "");
  if (!UUID.test(listId)) return fail(400, { remove: { error: "invalid_request" } });
  if (form.get("confirm") !== "oui") return fail(400, { remove: { error: "confirm" } });
  const refused = await refusal(() =>
    apiJson<undefined>(event, `/manage/lists/${listId}`, { method: "DELETE" }),
  );
  if (refused) return fail(refused.status, { remove: { error: refused.code } });
  redirect(303, "/?supprimee=1");
}
