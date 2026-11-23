<p align="center">
  <img src="docs/images/logo.svg" alt="wishlist logo" width="120">
</p>

<h1 align="center">wishlist</h1>

<p align="center">
  <strong>Self-hosted wishlists for a family: events, shared gifts, and a strict anti-spoil rule.</strong>
</p>

<p align="center">
  <a href="https://arcanexus.github.io/wishlist/"><strong>Website</strong></a> ·
  <a href="https://github.com/Arcanexus/wishlist/wiki"><strong>Documentation</strong></a> ·
  <a href="https://github.com/Arcanexus/wishlist/releases"><strong>Releases</strong></a>
</p>

<p align="center">
  <a href="https://github.com/Arcanexus/wishlist/releases"><img src="https://img.shields.io/github/v/release/Arcanexus/wishlist?include_prereleases&sort=semver&label=version" alt="Latest version"></a>
  <a href="https://github.com/Arcanexus/wishlist/actions/workflows/docker-publish.yml"><img src="https://github.com/Arcanexus/wishlist/actions/workflows/docker-publish.yml/badge.svg?branch=main" alt="Build"></a>
  <a href="https://github.com/Arcanexus/wishlist/actions/workflows/tests.yml"><img src="https://github.com/Arcanexus/wishlist/actions/workflows/tests.yml/badge.svg?branch=main" alt="Tests"></a>
  <a href="https://github.com/Arcanexus/wishlist/actions/workflows/tests.yml"><img src="https://img.shields.io/endpoint?url=https://raw.githubusercontent.com/Arcanexus/wishlist/main/.github/badges/coverage.json" alt="Coverage"></a>
  <a href="https://github.com/Arcanexus/wishlist/actions/workflows/codeql.yml"><img src="https://github.com/Arcanexus/wishlist/actions/workflows/codeql.yml/badge.svg?branch=main" alt="CodeQL"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/Arcanexus/wishlist" alt="License"></a>
</p>

---

wishlist lets a family keep several wishlists, pick items for recurring events (birthdays,
Christmas), and chip in together for the same gift. Its core promise: **the owner of a list never
sees who gave what**, until they lift the secret after the event. The rule is enforced on the
server, not hidden in the page.

> **Status:** foundation. The four components build, test, ship as images and deploy with the Helm
> chart. The data model and the business rules (funding, anti-spoil) are in place and tested; the
> API and the screens come next.

|                         |                                                                         |
| ----------------------- | ----------------------------------------------------------------------- |
| 🤫 **Nothing spoiled**  | No amount, name or progress shown to the owner, link previews included. |
| 🎁 **Gifts together**   | Several contributions per item, across events, overshoot allowed.       |
| 📅 **Lists and events** | Durable lists, recurring events, series of books, recurring wishes.     |
| 👵 **For every age**    | Large touch targets, no password, an item added in under five seconds.  |
| ⚡ **Light**            | Little JavaScript, quick on a modest phone.                             |
| 🏠 **Self-hosted**      | Four images, one Helm chart, made for a GitOps homelab.                 |

## Quick start

```sh
corepack enable && pnpm install
docker compose up -d
pnpm dev
```

See the [quick start](docs/quick-start.md), the [installation on Kubernetes](docs/installation.md),
the [architecture](docs/architecture.md) and the [data model](docs/data-model.md).

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) and [docs/development.md](docs/development.md). Security
issues: [SECURITY.md](SECURITY.md).

## License

[Apache-2.0](LICENSE)
