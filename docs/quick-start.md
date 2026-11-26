# Quick start

Run Wishalia on your machine with Node.js 22.17+ (26 recommended), pnpm (through Corepack) and Docker.

```sh
npm install -g corepack  # Node.js 25 and later no longer ship it
corepack enable
pnpm install
cp .env.example .env
docker compose up -d     # PostgreSQL, Garage (S3) and imgproxy
pnpm build && pnpm --filter @wishalia/db db:migrate   # the tables (reads DATABASE_URL)
pnpm dev                 # the four components, with hot reload
```

Put your email in `OWNER_EMAILS` (`.env`), then ask for a magic link: in development, the API
prints the link in its log instead of sending an email.

```sh
curl -X POST http://localhost:3003/auth/sign-in/magic-link \
  -H 'content-type: application/json' -H 'origin: http://localhost:3003' \
  -d '{"email":"you@example.com"}'
```

| Component                  | URL                           |
| -------------------------- | ----------------------------- |
| Public view (`web-public`) | http://localhost:3002         |
| Management app (`web-app`) | http://localhost:3003         |
| API (`api`)                | http://localhost:3000/healthz |
| Worker (`worker`)          | http://localhost:3001/healthz |
| Garage (S3)                | http://localhost:9000         |

A local database made by an older `docker-compose.yml` (PostgreSQL 18) stays in its own folder of
the `postgres` volume: PostgreSQL 19 starts empty beside it. Start afresh with
`docker compose down -v`, or move the data with `pg_dump` and `pg_restore`.

To deploy on a cluster, see [Installation](installation.md).
