# @wishalia/config

Shared TypeScript settings for every package and app.

- `tsconfig.base.json`: strict TypeScript, ES2023, Node ESM resolution.
- `tsconfig.node.json`: the base plus the Node.js types, for the API, the worker and the server packages.

ESLint and Prettier are configured once at the root of the repository (`eslint.config.js`, `.prettierrc.json`).
