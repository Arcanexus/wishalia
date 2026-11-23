# wishlist: working rules

Self-hosted family wishlists. Product name **Wishalia** (shown through `APP_NAME`, default `Wishalia`);
code name `wishlist`, kept in packages, images, chart, cookies (`wishlist.*`) and metrics (`wishlist_`).
Branding (logo, palettes, fonts, themes): `docs/branding.md`.

## Non-negotiable rules

1. **Anti-spoil**: the owner never sees contributions (amounts, names, percentages, history) before
   they lift the secret. Enforced server side in one function of `packages/domain`, used by every
   API, with tests. `/manage/*` responses never carry contribution data.
2. **Separation**: two frontends (`web-app`, `web-public`), two hosts, two API scopes
   (`/manage`, `/public`). These scopes are internal, only the frontends call them. The one
   exception (planned): the public REST API v1 on its own host, authenticated by personal access
   tokens (hash stored, expiry, rate limit), with `/manage` rights and never any contribution data.
   Prometheus `/metrics` is on its own port, never on the ingress, and no metric describes
   contributions.
3. **History**: every action on an item writes an append-only `item_events` row with a visibility
   (`owner`, `guests`, `sealed`).
4. **UX**: adding an item takes under 5 seconds on any device (optimistic add, async enrichment).

Priorities, in order: security, ease of use for every age (WCAG 2.2 AA), performance.

## Every change

Update in the same pull request, when concerned: `docs/` (published to the wiki; a new page goes
into `PAGES` of `.github/scripts/docs_to_wiki.py`), the tests (coverage thresholds in
`vitest.config.ts`), the Helm chart and `docs/chart-values.md`, the `[Unreleased]` section of
`CHANGELOG.md`. Then review and update, every time: `README.md`, the website (`site/`), the wiki
(generated from `docs/`) and the screenshots (`docs/images/`). Only retake the screenshots that show
what changed.

## Conventions

- TypeScript strict; business rules as pure functions in `packages/domain`; amounts in cents.
- Configuration only through environment variables; no secret in code or chart.
- SvelteKit 3: config lives in `vite.config.ts` (`sveltekit({...})`), `#lib` (package.json `imports`)
  replaces `$lib`, hooks types come from `@sveltejs/kit/hooks`.
- Checks: `pnpm format:check && pnpm build && pnpm lint && pnpm typecheck && pnpm coverage`, and
  `helm lint charts/wishlist`.
- PR titles start with `[ADD]` or `[FIX]` and link an issue (see the PR template).
