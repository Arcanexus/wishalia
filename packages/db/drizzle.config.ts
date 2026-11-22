import { defineConfig } from "drizzle-kit";

// Versioned migrations: `pnpm --filter @wishlist/db db:generate` writes them to migrations/,
// the Kubernetes migration Job applies them before the API starts.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema.ts",
  out: "./migrations",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "",
  },
  strict: true,
});
