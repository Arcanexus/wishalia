# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- The management app installs on a phone, a tablet or a computer (Progressive Web App): a manifest
  (`/manifest.webmanifest`, named after `APP_NAME`), icons (192, 512, maskable, Apple touch), a
  status bar colour that follows the theme and mode, and a service worker that keeps only the app's
  code and icons, never a private page, with a « Pas de connexion » page when offline.
- Web Share Target: on Android, « Partager » then « Wishalia » from any app opens « Ajouter une
  envie » (`/ajouter`) with the shared link and words in the field, a choice of list, and one button
  to add. The page never adds on its own. A shared link survives the sign-in page.
- iOS Shortcut, documented step by step ([Install the app](docs/install-app.md)): through the add
  page, or in the background with a REST API v1 token.
- « Réglages » shows how to install the app on the device in hand, an « Installer Wishalia » button
  where the browser offers one, and the address for the iPhone Shortcut.
- The Helm chart deploys its own PostgreSQL when you have none (`postgresql.enabled`, the default):
  the official image as a StatefulSet with its volume (or an existing claim), a password made once and kept, a
  NetworkPolicy, and `DATABASE_URL` given to the API and the worker. With your own PostgreSQL, set
  `postgresql.enabled=false` and give its URL in `externalDatabase.existingSecret` (any key) or in
  `existingSecret`. The migrations wait for the database to start, and take a lock so that several
  API pods never apply them at once.

### Changed

- Items no longer carry `imageKey` (always empty until now) in the APIs, REST v1 included: they carry
  `image` (signed thumbnail paths, or `null`) and `imageCrop`.
- docker compose pins imgproxy (v4.0.25) and signs its paths with local keys, as in production.

- The product is named **Wishalia**, and the code name `wishlist` is gone: default `APP_NAME` and
  chart `config.appName`, packages (`@wishalia/*`), images (`ghcr.io/arcanexus/wishalia-*`, no longer
  derived from the repository name), the chart (`charts/wishalia`), cookies (`wishalia.*`), metrics
  (`wishalia_*`), the development database and bucket, README, website, documentation, and a new
  logo (five relatives in a circle around a gift). Nothing was deployed yet, so nothing breaks. The
  links point to `Arcanexus/wishalia`, the repository's new name.

### Fixed

- After a move within an app, the page title could show in a corner: SvelteKit's route announcer
  hides itself with a `style` attribute that the CSP blocks. The shared styles now hide it.
- The words guests leave for the owner (« À lire après l'occasion ») never reached them: once the
  secret is lifted, the event page shows each one under the gift it goes with.
- The gifts made without an event never showed who gave them: the list's page now shows who gave
  what, and their words, once the item is received or the list's secret lifted.
- The REST API v1 gave who gave what, with amounts, in an item's history once a secret was lifted,
  against its rule of never giving contribution data. Sealed entries now stay out of v1 for good;
  the management app still shows them after the secret is lifted.
- Both frontends' root element used a `style` attribute that their CSP (`style-src 'self'`)
  blocked: it is a class now.
- The sign-out and light/dark buttons were refused by the CSRF check in real browsers: with
  `Referrer-Policy: no-referrer`, a plain form sends `Origin: null`. The two frontends now send
  `same-origin`, which still never gives a share link token to another site.
- The OIDC callback URL in the documentation is `/auth/callback/oidc`.

### Added

- Items show an image (docs/images.md). The worker takes up to four images from the page of an
  item's link, through the same SSRF guard as the page, keeps only real images read from their bytes
  (JPEG, PNG, WebP, GIF, AVIF, HEIC; never SVG; 120 px to 50 megapixels, 10 MB at most) on a volume
  or in an S3 bucket, and the item shows the first. An « Image » page per item lets the owner choose another,
  send their own photo (made lighter on the device when over 1.5 MB) and frame it in a square, by
  dragging, tapping, the arrow keys or a slider. imgproxy makes the thumbnails from signed paths
  only; the two frontends serve them under `/img/` on their own host, so the CSP keeps
  `img-src 'self'` and imgproxy and the files stay inside the cluster. The images show on the
  owner's lists, in the preview and in the family's view. New table `wish_images`, items get
  `image_id` and `image_crop`; open items with a link are read once more for their images. New
  routes `GET /manage/items/:id/images`, `PUT` and `PATCH /manage/items/:id/image` (also in the REST
  API v1), `image_changed` history entries, `features.images` in `/manage/me`, and the package
  `@wishalia/storage`. The files live where you choose (`IMAGE_STORAGE`, chart `images.storage`):
  on a volume (`volume`, the default: a PersistentVolumeClaim created by the chart and kept on
  uninstall, or `images.persistence.existingClaim`; imgproxy mounts it read-only, and a
  `ReadWriteOnce` volume keeps the API, the worker and imgproxy on one node), or in an S3 bucket
  (`s3`, MinIO). Chart: `images.*` deploys imgproxy (internal, NetworkPolicy to the two frontends)
  and sets `BODY_SIZE_LIMIT` on the management app.

- Items added with a link complete themselves: the worker reads the page (JSON-LD `Product`, then
  Open Graph, then `<title>`) and fills the title, while it is still the site's name, and an empty
  price. It never reaches an internal address (checked after DNS and at each redirect), stops at
  10 s and 3 MB, tries 3 times, and writes an `enriched` history entry. The list page shows the
  items being completed. The queue is a column in PostgreSQL (`enrichment`, migration `0007`), and
  the worker now needs `DATABASE_URL`. New metrics `wishalia_enrichment_*`.
- Reordering a list's items: a handle to drag with a mouse or a finger, and « Monter » / « Descendre »
  arrows for one tap, the keyboard or without JavaScript; the new place is announced. The API takes
  the whole new order at once (`PUT /manage/lists/:id/order`), or nothing when the list changed.
- « Aperçu » on a list page: the list as relatives see it, with made-up gifts plainly marked as
  examples, built without reading any real contribution. The guests' item card and drawings moved
  to `@wishalia/ui` so that both apps draw them the same way.
- Public view of the share links (`/s/<token>`): the list or the event, whose wishes they are, each
  item with its price, notes, link and where it stands (free, reserved by whom, copies left, the
  pool's progress, given at every occasion, received), what is still to give first. The owner on
  their own link is warned and sees no funding at all. An unknown, revoked or expired link gives
  one same page. Same title and preview for every link, `noindex`, never cached; light/dark button.
  See [Public view](docs/public-view.md).
- A list's settings in the management app: its name, a theme forced on everyone (or none), when the
  secret of the gifts made without an event lifts, lifting it, and archiving the list, the last two
  behind a box to tick. See [Management app](docs/management-app.md#a-lists-settings).
- Editing an item in the management app, in place: its name, its kind (a gift, possibly given at
  every occasion; several copies; a pool with an optional target), its price, its list, its link
  and its notes. Works without JavaScript. See
  [Management app](docs/management-app.md#editing-an-item).
- The public view draws where things stand: a pool's bar split by event, with a mark at the target
  and the overshoot hatched past it (« objectif atteint, 60 € en excédent »); one box per copy;
  the givers' initials; « Presque complet » from 80 %; and, at the top, where the event or the
  list stands (« 2 complets, 1 en cours, 0 libre »). See [Public view](docs/public-view.md).
- Contributions folded for a visitor nobody knows on the public view (no account, nothing given
  from the device): states, progress, names and the give buttons stay out of the page until
  « Je ne suis pas Léa », remembered for the link on the device. See
  [Public view](docs/public-view.md#a-visitor-nobody-knows).
- Giving from the public view: reserve a gift or some copies, chip in to a pool, with a word for the
  owner and the choice to stay discreet; on a list link, the event the gift is for. The person sees
  their gifts and withdraws them; without an account, the withdraw key stays in an HttpOnly cookie
  scoped to the link, and their first name is remembered. Works without JavaScript.
  See [Public view](docs/public-view.md#giving).
- `@wishalia/ui`: the design tokens, fonts, logo and light/dark button, shared by the two frontends.

- Passkeys in the management app: « Se connecter avec une clé d'accès » and the passkeys offered in
  the e-mail field's suggestions on `/connexion`; « Clés d'accès » in the settings to add, rename and
  delete them. Passkeys are discoverable (no email to type), and adding one needs a sign-in of less
  than a day. The API tests run the real WebAuthn ceremonies with a software authenticator.
- Management app, settings (`/reglages`): the name, the theme and light or dark, stored with the
  account and followed by the header button and the device's cookies; the API tokens (made, shown
  once, revoked) when the REST API v1 is on. The header gets « Réglages ».
- `GET /manage/me` gives the person's `theme` and `mode`; `PATCH /manage/me` changes them and the
  display name. Migration `0006_user_display_settings`.
- Management app, sharing (`/partage`): one link per guest or group for a list or an event, with
  an optional end date, its address shown once with « Copier le lien » and « Envoyer… », the
  device marked as the owner's, the active links and their revocation behind a confirmation.
  « Partager cette liste » and « Partager cet événement » lead there. The header gets
  « Partager », and its mode button an icon.
- Management app, events (`/evenements`): the events, upcoming and past, their creation and
  settings, the items an event selects (added from every list in one tap, or removed), and lifting
  the secret once allowed, behind a confirmation. Then each item shows who gave what for the event.
  A Christmas event turns the automatic theme to Christmas. The header gets « Mes listes » and
  « Événements ».
- Management app, first screens (see [Management app](docs/management-app.md)): signing in by
  e-mail link or single sign-on (`/connexion`, button named by `auth.oidc.name` / `OIDC_NAME`),
  signing out, the lists with their number of wishes, list creation, the quick add (shown at once,
  undo offered when the link is already there) and a list page where items are marked received,
  archived or put back. Neutral and Christmas themes in light and dark, the header button that
  switches the mode (kept in the `wishalia.mode` cookie, applied server side without a flash), the
  theme a list forces, Nunito and Inter. Every page passes axe (WCAG 2.2 AA) in both modes, on a
  phone and a computer, and works without JavaScript.
- `@wishalia/domain`: `resolveTheme`, `parseThemeChoice`, `parseModeChoice`, `nextMode`.
- Chart: `auth.oidc.name`; `docs/chart-values.md` now lists the `auth.*` values.
- REST API v1 (`/v1/*`) on its own host (`hosts.api`, off by default), for scripts and home
  automation: personal access tokens made, listed and revoked in `/manage/api-tokens` (hash stored,
  1 to 365 days, read-only option), the rights of `/manage` without any contribution data, a rate
  limit per token (`API_RATE_LIMIT`) and an OpenAPI 3.1 description at `/v1/openapi.json`. The
  ingress forwards `/v1` only on that host, and the API refuses its other routes there. See
  [REST API v1](docs/rest-api.md).
- Migration `0005_api_tokens`.

- Share links per guest or group, for a list or an event: created, listed and revoked in
  `/manage/share-links`, with the device marker that recognises the owner without a session.
- Public view API (`/public/*`): the view of a share link, contributions and reservations (pools
  with overshoot, unique and quantity items, repeatable items per event) and their withdrawal by
  their author. A contribution may have no event, since a list is not always tied to one; its
  secret then lifts as the list says (`revealMode`): when the owner marks the item received
  (default), or when they lift the secret of the list (`POST /manage/lists/:id/reveal`). The owner gets no funding until every
  secret of an item is lifted, and cannot contribute. See [Public view API](docs/public-api.md).
- `@wishalia/domain`: `isShareLinkActive`, `refuseContribution`, and `canSeeContributions` now takes
  the secret of an event or of an item (`SecretState`).
- Migration `0004_contributions_without_event`: the event of a contribution becomes optional, the
  list's `reveal_mode` and `revealed_at`, and the hash of the key a guest without an account uses
  to withdraw their contribution.
- Social preview image (`docs/images/social-preview.png`, 1280 × 640) for the repository and the
  website's Open Graph tags, and a dark logo variant used by the README and the website in dark
  mode.
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
