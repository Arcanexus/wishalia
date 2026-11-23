import { defineConfig } from "vitest/config";

// One Vitest run for the whole monorepo (pnpm coverage), each package being a project.
// The coverage threshold fails the CI: business rules stay fully tested.
export default defineConfig({
  test: {
    projects: ["packages/*", "apps/*"],
    coverage: {
      provider: "v8",
      include: ["packages/*/src/**/*.ts", "apps/*/src/**/*.ts"],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/index.ts",
        // Entry points: they only wire the tested modules together and start the process
        "apps/*/src/main.ts",
        "apps/*/src/migrate.ts",
        "packages/db/src/*-cli.ts",
        "packages/db/src/schema.ts",
      ],
      reporter: ["text", "html", "json-summary", "cobertura"],
      thresholds: { lines: 90, functions: 90, branches: 85, statements: 90 },
    },
  },
});
