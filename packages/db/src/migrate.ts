import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** The versioned migrations, shipped with the package (see `files` in package.json). */
export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** Key of the advisory lock taken while migrating ("wish"): one runner at a time. */
export const MIGRATION_LOCK = 0x77697368;

export interface MigrateOptions {
  /** How long to keep trying while the database cannot be reached yet (it may be starting). */
  waitMs?: number;
  /** The pause between two tries. */
  retryMs?: number;
}

/** The errors of a database that is not there yet: no server, no name, still starting. */
const NOT_YET = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "EAI_AGAIN",
  "ETIMEDOUT",
  "CONNECT_TIMEOUT",
  // cannot_connect_now: the server is starting or stopping
  "57P03",
]);

export const isNotReachableYet = (error: unknown): boolean =>
  NOT_YET.has(String((error as { code?: unknown } | null)?.code ?? ""));

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Applies the pending migrations, in order, in one connection. Safe to run at every deploy, and by
 * several API pods at once: an advisory lock makes the others wait, then find nothing left to do.
 */
export async function runMigrations(url: string, { waitMs = 0, retryMs = 2_000 }: MigrateOptions = {}) {
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  const deadline = Date.now() + waitMs;
  for (;;) {
    const sql = postgres(url, { max: 1, onnotice: () => undefined });
    try {
      // Held by the session: released when the connection closes, even after a failure
      await sql`SELECT pg_advisory_lock(${MIGRATION_LOCK})`;
      await migrate(drizzle(sql), { migrationsFolder });
      return;
    } catch (error) {
      if (!isNotReachableYet(error) || Date.now() + retryMs > deadline) throw error;
    } finally {
      await sql.end({ timeout: 5 });
    }
    await pause(retryMs);
  }
}
