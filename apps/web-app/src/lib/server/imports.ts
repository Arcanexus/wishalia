import { fail, redirect, type RequestEvent } from "@sveltejs/kit";
import {
  type ImportedWish,
  type ImportPreview,
  MAX_IMPORT_BYTES,
  MAX_IMPORT_ITEMS,
  MAX_IMPORT_LIST_NAME_LENGTH,
  sourceOfFile,
} from "@wishalia/domain";

import { ApiError, apiJson } from "./api.ts";

/**
 * Importing a list made elsewhere (docs/import.md), in two steps: read the source (a Wishlistr
 * address, a file or pasted text) and show what it gives; then add the wishes the person kept,
 * to the list they chose. The API reads and checks everything again: this only carries the form.
 */

type FormEvent = Pick<RequestEvent, "request" | "getClientAddress" | "url" | "cookies" | "locals">;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SOURCES = ["wishlistr", "csv", "json", "text"] as const;
type Source = (typeof SOURCES)[number];

/** What the page shows after reading: the preview, and the items again to send back. */
export type ReadResult =
  | { preview: ImportPreview & { address?: string }; payload: string }
  | { error: string; how: string; address?: string; text?: string };

/** Reads the source picked: « lien » (Wishlistr), « fichier » or « texte ». Adds nothing. */
export async function readSource(event: FormEvent) {
  const form = await event.request.formData();
  const how = String(form.get("how") ?? "");
  const address = String(form.get("address") ?? "").trim();
  const text = String(form.get("text") ?? "");
  const refuse = (status: number, error: string) =>
    fail(status, { read: { error, how, address, text: text.slice(0, 20_000) } satisfies ReadResult });

  let body:
    { source: "wishlistr"; address: string } | { source: Exclude<Source, "wishlistr">; content: string };
  if (how === "lien") {
    if (!address) return refuse(400, "empty_address");
    body = { source: "wishlistr", address };
  } else if (how === "fichier") {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) return refuse(400, "empty_file");
    if (file.size > MAX_IMPORT_BYTES) return refuse(413, "too_large");
    const content = await file.text();
    body = { source: sourceOfFile(file.name, content), content };
  } else if (how === "texte") {
    if (!text.trim()) return refuse(400, "empty");
    if (new TextEncoder().encode(text).length > MAX_IMPORT_BYTES) return refuse(413, "too_large");
    body = { source: "text", content: text };
  } else {
    return refuse(400, "invalid_request");
  }

  try {
    const preview = await apiJson<ImportPreview & { address?: string }>(event, "/manage/imports/preview", {
      method: "POST",
      body,
    });
    return { read: { preview, payload: JSON.stringify(preview.items) } satisfies ReadResult };
  } catch (failure) {
    if (failure instanceof ApiError) return refuse(failure.status, failure.code);
    throw failure;
  }
}

/** Adds the wishes kept (their numbers in the preview) to the list chosen, or to a new one. */
export async function commitImport(event: FormEvent) {
  const form = await event.request.formData();
  const source = String(form.get("source") ?? "") as Source;
  const target = String(form.get("listId") ?? "");
  const listName = String(form.get("listName") ?? "").trim();
  if (!SOURCES.includes(source)) return fail(400, { commit: { error: "invalid_request" } });
  const payload = String(form.get("payload") ?? "");
  let items: ImportedWish[];
  try {
    const parsed: unknown = JSON.parse(payload);
    if (!Array.isArray(parsed) || parsed.length > MAX_IMPORT_ITEMS) throw new TypeError("not a preview");
    items = parsed as ImportedWish[];
  } catch {
    return fail(400, { commit: { error: "invalid_request" } });
  }
  const picked = new Set(form.getAll("pick").map((value) => Number(value)));
  // A refusal shows the same preview again, so that nothing has to be read twice
  const refuse = (status: number, error: string) =>
    fail(status, {
      commit: { error, unpicked: items.flatMap((_, index) => (picked.has(index) ? [] : [index])) },
      read: {
        preview: { source, listName: listName || null, items, skipped: [] },
        payload,
      } satisfies ReadResult,
    });
  const kept = items.filter((_, index) => picked.has(index));
  if (kept.length === 0) return refuse(400, "nothing_picked");

  let list: { listId: string } | { listName: string };
  if (target === "nouvelle") {
    if (!listName || listName.length > MAX_IMPORT_LIST_NAME_LENGTH) return refuse(400, "invalid_name");
    list = { listName };
  } else if (UUID.test(target)) {
    list = { listId: target };
  } else {
    return refuse(400, "invalid_request");
  }

  let result: { listId: string; added: number; duplicates: number; skipped: number };
  try {
    result = await apiJson(event, "/manage/imports", {
      method: "POST",
      body: { source, ...list, items: kept },
    });
  } catch (failure) {
    if (failure instanceof ApiError) return refuse(failure.status, failure.code);
    throw failure;
  }
  const query = new URLSearchParams({ importees: String(result.added) });
  if (result.duplicates > 0) query.set("doublons", String(result.duplicates));
  redirect(303, `/listes/${result.listId}?${query}`);
}
