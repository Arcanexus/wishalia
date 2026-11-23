# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- The product is named **Wishalia**, and the code name `wishlist` is gone: default `APP_NAME` and
  chart `config.appName`, packages (`@wishalia/*`), images (`ghcr.io/arcanexus/wishalia-*`, no longer
  derived from the repository name), the chart (`charts/wishalia`), cookies (`wishalia.*`), metrics
  (`wishalia_*`), the development database and bucket, README, website, documentation, and a new
  logo (five relatives in a circle around a gift). Nothing was deployed yet, so nothing breaks. The
  links point to `Arcanexus/wishalia`, the repository's new name.

### Added

- Share links per guest or group, for a list or an event: created, listed and revoked in
  `/manage/share-links`, with the device marker that recognises the owner without a session.
- Public view API (`/public/*`): the view of a share link, contributions and reservations (pools
  with overshoot, unique and quantity items, repeatable items per event) and their withdrawal by
  their author. A contribution may have no event, since a list is not always tied to one; its
  secret then lifts when the owner marks the item received. The owner gets no funding until every
  secret of an item is lifted, and cannot contribute. See [Public view API](docs/public-api.md).
- `@wishalia/domain`: `isShareLinkActive`, `refuseContribution`, and `canSeeContributions` now takes
  the secret of an event or of an item (`SecretState`).
- Migration `0004_contributions_without_event`: the event of a contribution becomes optional, and
  the hash of the key a guest without an account uses to withdraw their contribution.

- Management API (`/manage/*`): lists, items (quick add from a URL or text, in-place edits, moves,
  received and archived), events (item selection, reveal of the secret) and the history of each
  item. Everything is scoped to its owner (404 otherwise) and never returns contribution data.
  See [Management API](docs/api.md).
- A list can force its theme (`neutral` or `christmas`) on everyone who opens it (migration
  `0003_list_theme`).
- `@wishalia/domain`: `parseQuickAdd`, `cleanUrl` (tracking parameters removed, only http(s)
  links) and `diffWish` for the history.
- JSON errors on every route, without internal details in a 500.
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
  chart), request durations per route pattern, Node.js process metrics, `wishalia_build_info`. No
  metric describes contributions. See [Monitoring](docs/monitoring.md).
- Chart: `metrics.*` values, a `metrics` port on every Service (the worker gets a Service for it),
  NetworkPolicy rules for the scrape (`metrics.allowFrom`) and an optional ServiceMonitor.
- Data model: nine tables (users, lists, items, series, events, event items, contributions, share
  links, item history) and the first migration. See [Data model](docs/data-model.md).
- `item_events` is append-only, enforced by a database trigger.
- Share links store only the SHA-256 hash of their token.
- `@wishalia/domain`: funding rules (totals, remaining, overshoot, segments per event, item states)
  and the anti-spoil rule (`resolveViewer`, `canSeeContributions`, `canSeeHistoryEntry`).
- Demo data (`db:seed`) and the migration entry point of the API image (`node dist/migrate.js`).

- Monorepo (pnpm + Turborepo, TypeScript strict) with four components: the API (Fastify, separate
  `/manage` and `/public` scopes), the worker, the management app and the public view (SvelteKit).
- `@wishalia/domain`: amounts in cents, parsing of amounts typed the French way (`12,50`).
- Security headers on every response: strict CSP, `no-referrer`, no framing.
- Generic page titles and link previews on the public view: they never reflect the state of a list.
- One Dockerfile for the four images (`--build-arg APP=...`), non-root and without npm at run time.
- Helm chart `charts/wishalia`: four Deployments, two hosts, internal API behind a NetworkPolicy,
  hardened pods, migration Job. See [Chart values](docs/chart-values.md).
- CI: format, lint, typecheck, tests with a coverage threshold and badge, chart lint, multi-arch
  images scanned by Trivy, CodeQL, dependency audit, Dependabot, release, chart publication.
- Documentation in `docs/`, published to the wiki, and the product website on GitHub Pages.
