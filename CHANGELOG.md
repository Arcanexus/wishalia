# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The product is named **Wishalia**: default `APP_NAME` and chart `config.appName`, README, website,
  documentation and a new logo (five relatives in a circle around a gift). The code name `wishlist`
  stays in packages, images, the chart, cookies and metrics, so nothing breaks on upgrade.

### Added

- [Branding](docs/branding.md): logo, neutral and Christmas palettes in light and dark, fonts, and
  the theme settings each person will get (theme and light/dark mode) and the theme a list can
  force.

- Sign-in with Better Auth in the API: OIDC for the owners, passkeys and magic links for the
  family, no password. Invitation only (`OWNER_EMAILS`). A 30-day `__Secure-` session shared by the
  two hosts (`COOKIE_DOMAIN`). See [Authentication](docs/authentication.md).
- The management app proxies `/auth/*` to the internal API; `/manage/*` needs a session
  (`/manage/me`).
- Migration `0002_auth`: sessions, accounts, verifications and passkeys tables.
- `/readyz` of the API checks the database.
- Chart: `auth.*` values (owners, cookie domain, OIDC, magic link sender), with a guard on the
  cookie domain.
- Prometheus metrics on every component: `/metrics` on its own port (`METRICS_PORT`, 9464 in the
  chart), request durations per route pattern, Node.js process metrics, `wishlist_build_info`. No
  metric describes contributions. See [Monitoring](docs/monitoring.md).
- Chart: `metrics.*` values, a `metrics` port on every Service (the worker gets a Service for it),
  NetworkPolicy rules for the scrape (`metrics.allowFrom`) and an optional ServiceMonitor.
- Data model: nine tables (users, lists, items, series, events, event items, contributions, share
  links, item history) and the first migration. See [Data model](docs/data-model.md).
- `item_events` is append-only, enforced by a database trigger.
- Share links store only the SHA-256 hash of their token.
- `@wishlist/domain`: funding rules (totals, remaining, overshoot, segments per event, item states)
  and the anti-spoil rule (`resolveViewer`, `canSeeContributions`, `canSeeHistoryEntry`).
- Demo data (`db:seed`) and the migration entry point of the API image (`node dist/migrate.js`).

- Monorepo (pnpm + Turborepo, TypeScript strict) with four components: the API (Fastify, separate
  `/manage` and `/public` scopes), the worker, the management app and the public view (SvelteKit).
- `@wishlist/domain`: amounts in cents, parsing of amounts typed the French way (`12,50`).
- Security headers on every response: strict CSP, `no-referrer`, no framing.
- Generic page titles and link previews on the public view: they never reflect the state of a list.
- One Dockerfile for the four images (`--build-arg APP=...`), non-root and without npm at run time.
- Helm chart `charts/wishlist`: four Deployments, two hosts, internal API behind a NetworkPolicy,
  hardened pods, migration Job. See [Chart values](docs/chart-values.md).
- CI: format, lint, typecheck, tests with a coverage threshold and badge, chart lint, multi-arch
  images scanned by Trivy, CodeQL, dependency audit, Dependabot, release, chart publication.
- Documentation in `docs/`, published to the wiki, and the product website on GitHub Pages.
