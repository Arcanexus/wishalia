import { redirect } from "@sveltejs/kit";

import type { Passkey } from "#lib/types.ts";

import { ApiError, apiFetch } from "./api.ts";

type Event = Parameters<typeof apiFetch>[0];

/** The longest passkey name the settings accept. */
export const PASSKEY_NAME_MAX = 60;

/**
 * The passkeys live in Better Auth, under /auth/passkey: its errors are `{ code }`, not the
 * `{ error }` of /manage. Without a session, the person goes to the sign-in page.
 */
async function call<T>(event: Event, path: string, body?: unknown): Promise<T> {
  const response = await apiFetch(event, `/auth/passkey/${path}`, {
    ...(body !== undefined ? { method: "POST" as const, body } : {}),
  });
  if (response.status === 401 && path === "list-user-passkeys") {
    redirect(303, `/connexion?retour=${encodeURIComponent(event.url.pathname)}`);
  }
  const payload = (await response.json().catch(() => null)) as { code?: string } | null;
  if (!response.ok) throw new ApiError(response.status, payload?.code?.toLowerCase() ?? "unknown");
  return payload as T;
}

interface RawPasskey {
  id: string;
  name?: string | null;
  createdAt?: string | null;
  backedUp?: boolean;
}

/** The person's passkeys, newest first, with only what the page shows. */
export async function listPasskeys(event: Event): Promise<Passkey[]> {
  const rows = await call<RawPasskey[]>(event, "list-user-passkeys");
  return rows
    .map((row) => ({
      id: row.id,
      name: row.name ?? null,
      createdAt: row.createdAt ?? null,
      synced: row.backedUp === true,
    }))
    .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
}

export async function renamePasskey(event: Event, id: string, name: string): Promise<void> {
  await call(event, "update-passkey", { id, name });
}

export async function deletePasskey(event: Event, id: string): Promise<void> {
  await call(event, "delete-passkey", { id });
}
