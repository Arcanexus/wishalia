import { runMigrations } from "./migrate.js";

// pnpm --filter @wishalia/db db:migrate, and the migration Job of the Helm chart
await runMigrations(process.env.DATABASE_URL ?? "");
process.stdout.write("Migrations applied\n");
