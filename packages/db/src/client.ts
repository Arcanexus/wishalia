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
  const sql = postgres(url, { max: maxConnections });
  return {
    db: drizzle(sql, { schema }),
    close: () => sql.end({ timeout: 5 }),
  };
}

export type Db = ReturnType<typeof createDb>["db"];
