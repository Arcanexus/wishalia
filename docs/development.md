# Development

## Commands

| Command                                             | What it does                                                                |
| --------------------------------------------------- | --------------------------------------------------------------------------- |
| `pnpm dev`                                          | Starts the four components with hot reload.                                 |
| `pnpm build`                                        | Builds every package and app (Turborepo, cached).                           |
| `pnpm lint`                                         | ESLint on every package.                                                    |
| `pnpm typecheck`                                    | TypeScript, and svelte-check on the frontends.                              |
| `pnpm test`                                         | Vitest, package by package.                                                 |
| `pnpm coverage`                                     | Vitest on the whole repository with coverage; fails under the thresholds.   |
| `pnpm format` / `pnpm format:check`                 | Prettier.                                                                   |
| `pnpm --filter @wishalia/db db:migrate` / `db:seed` | Apply the migrations, load the demo data (see [Data model](data-model.md)). |

## Rules

- TypeScript strict everywhere. Business rules go to `packages/domain`, as pure functions with tests.
- Coverage thresholds: 90 % of lines, functions and statements, 85 % of branches.
- Every change updates, in the same pull request, the documentation (`docs/`), the tests, the chart
  and the CHANGELOG when they are concerned.
- No secret in the code or the chart: configuration only through environment variables.
- Migrations are versioned in `packages/db/migrations` and never edited once released.

## Images

```sh
docker build --build-arg APP=api -t wishalia-api .
```

`APP` is `api`, `worker`, `web-app` or `web-public`. The CI builds the four images for amd64 and
arm64.

## Releases

1. Move the `[Unreleased]` section of the CHANGELOG to `[X.Y.Z] - <date>`.
2. Set the version in `package.json` and in `charts/wishalia/Chart.yaml` (`version` and `appVersion`).
3. Tag `vX.Y.Z`: the CI checks the versions, publishes the images, the chart and the GitHub Release.

The documentation in `docs/` is published to the wiki on every merge to `main`.
