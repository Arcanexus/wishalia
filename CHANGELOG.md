# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Monorepo (pnpm + Turborepo, TypeScript strict) with four components: the API (Fastify, separate
  `/manage` and `/public` scopes), the worker, the management app and the public view (SvelteKit).
- `@wishlist/domain`: amounts in cents, parsing of amounts typed the French way (`12,50`).
- Security headers on every response: strict CSP, `no-referrer`, no framing.
- Generic page titles and link previews on the public view: they never reflect the state of a list.
- One Dockerfile for the four images (`--build-arg APP=...`), non-root and without npm at run time.
- Helm chart `charts/wishlist`: four Deployments, two hosts, internal API behind a NetworkPolicy,
  hardened pods, optional migration Job. See [Chart values](docs/chart-values.md).
- CI: format, lint, typecheck, tests with a coverage threshold and badge, chart lint, multi-arch
  images scanned by Trivy, CodeQL, dependency audit, Dependabot, release, chart publication.
- Documentation in `docs/`, published to the wiki, and the product website on GitHub Pages.
