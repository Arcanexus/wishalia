import { sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema.js";

export interface DbOptions {
  /** postgres://user:password@host:5432/database, read from DATABASE_URL by the apps. */
  url: string;
  /** Maximum number of connections of the pool. */
  maxConnections?: number;
}

/** Opens a connection pool and returns the Drizzle client with a function to close it. */
export function createDb({ url, maxConnections = 10 }: DbOptions) {
  if (!url) {
    throw new Error("DATABASE_URL is required");
  }
  const client = postgres(url, { max: maxConnections });
  return {
    db: drizzle(client, { schema }),
    close: () => client.end({ timeout: 5 }),
  };
}

export type Db = ReturnType<typeof createDb>["db"];

/** Any Drizzle PostgreSQL client of the schema: postgres-js in the apps, PGlite in the tests. */
export type Database = PgDatabase<PgQueryResultHKT, typeof schema>;

/** Checks that the database answers (readiness probe). */
export async function ping(db: Database): Promise<void> {
  await db.execute(sql`select 1`);
}
