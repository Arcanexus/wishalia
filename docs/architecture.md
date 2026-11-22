# Architecture

A TypeScript monorepo (pnpm + Turborepo) with four deployable components and shared packages.

```
apps/
  api/          Fastify: /manage/* (owner) and /public/* (share links), separate scopes
  web-app/      SvelteKit: the management app, for the owner
  web-public/   SvelteKit: the public view of the share links
  worker/       background jobs (pg-boss): enrichment of the items, price tracking
packages/
  domain/       pure business rules (amounts, funding, the anti-spoil rule)
  db/           Drizzle schema, versioned migrations, PostgreSQL client
  config/       shared TypeScript settings
charts/wishlist Helm chart of the four components
docs/           this documentation, published to the wiki
site/           the product website (GitHub Pages)
```

## Requests

People only reach the two frontends, through the ingress. The frontends call the API inside the
cluster, server side: the browser never talks to the API directly, which keeps the API off the
internet and lets the anti-spoil check run before anything reaches a page.

```
browser ──> ingress ──> web-public ──┐
                   └──> web-app ─────┴──> api ──> PostgreSQL
                                                  ▲
                                       worker ────┘   (jobs in PostgreSQL, pg-boss)
```

## Choices

| Topic      | Choice                    | Why                                                                        |
| ---------- | ------------------------- | -------------------------------------------------------------------------- |
| Frontends  | SvelteKit 3, adapter-node | Little JavaScript sent to the browser: fast on a modest phone.             |
| API        | Fastify 5                 | Fast, typed, schema-based validation.                                      |
| Database   | PostgreSQL + Drizzle      | One store for the data and the job queue (no Redis).                       |
| Auth       | Better Auth (coming)      | OIDC for the owner, passkeys and magic links for the family, no passwords. |
| Amounts    | Integers in cents         | No floating point on money.                                                |
| Deployment | One Helm chart, ArgoCD    | Matches the homelab GitOps flow.                                           |
