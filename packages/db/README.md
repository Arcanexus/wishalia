# @wishlist/db

The Drizzle schema, the versioned migrations (`migrations/`) and the PostgreSQL client.

```sh
pnpm --filter @wishlist/db db:generate   # writes a migration from the schema
pnpm --filter @wishlist/db db:migrate    # applies the migrations to DATABASE_URL
```

The tables come with the data model step. See [docs/architecture.md](../../docs/architecture.md).
