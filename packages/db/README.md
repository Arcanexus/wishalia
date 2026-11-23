# @wishalia/db

The Drizzle schema, the versioned migrations (`migrations/`) and the PostgreSQL client.

```sh
pnpm --filter @wishalia/db db:generate   # writes a migration from the schema
pnpm --filter @wishalia/db db:migrate    # applies the migrations to DATABASE_URL
pnpm --filter @wishalia/db db:seed       # demo data, local development only
```

See [docs/data-model.md](../../docs/data-model.md). The tests apply the real migrations to an
in-memory PostgreSQL (PGlite).
