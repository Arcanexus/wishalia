import { runMigrations } from "@wishlist/db";

// Entry point of the migration Job of the Helm chart (node dist/migrate.js), run before each deploy
await runMigrations(process.env.DATABASE_URL ?? "");
process.stdout.write("Migrations applied\n");
