import { runMigrations } from "@wishalia/db";

// Entry point of the migrations (node dist/migrate.js): the Job of the Helm chart before each deploy,
// or the first step of each API pod with the chart's own PostgreSQL, which may still be starting.
await runMigrations(process.env.DATABASE_URL ?? "", { waitMs: 5 * 60_000 });
process.stdout.write("Migrations applied\n");
