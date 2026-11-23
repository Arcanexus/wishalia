import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";

import type { Database } from "./client.js";
import { migrationsFolder } from "./migrate.js";
import * as schema from "./schema.js";

/**
 * An in-memory PostgreSQL (PGlite) with every migration applied, for the tests of the apps.
 * Needs @electric-sql/pglite, a dev dependency: never import this from application code.
 */
export async function createTestDb(): Promise<{ db: Database; close: () => Promise<void> }> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder });
  return { db, close: () => client.close() };
}
