import { fileURLToPath } from "node:url";

import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

/** The versioned migrations, shipped with the package (see `files` in package.json). */
export const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));

/** Applies the pending migrations, in order, in one connection. Safe to run at every deploy. */
export async function runMigrations(url: string): Promise<void> {
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  const sql = postgres(url, { max: 1 });
  try {
    await migrate(drizzle(sql), { migrationsFolder });
  } finally {
    await sql.end({ timeout: 5 });
  }
}
