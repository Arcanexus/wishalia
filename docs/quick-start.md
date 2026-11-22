# Quick start

Run wishlist on your machine with Node.js 22.17+, pnpm (through Corepack) and Docker.

```sh
corepack enable
pnpm install
cp .env.example .env
docker compose up -d     # PostgreSQL, MinIO (S3) and imgproxy
pnpm dev                 # the four components, with hot reload
```

| Component                  | URL                           |
| -------------------------- | ----------------------------- |
| Public view (`web-public`) | http://localhost:3002         |
| Management app (`web-app`) | http://localhost:3003         |
| API (`api`)                | http://localhost:3000/healthz |
| Worker (`worker`)          | http://localhost:3001/healthz |
| MinIO console              | http://localhost:9001         |

To deploy on a cluster, see [Installation](installation.md).
