# Security

Security is the first of the three priorities of the project, before ease of use and performance.

## The anti-spoil rule

The owner of a list never sees the contributions to their items: no amount, no name, no
percentage, no history, until they lift the secret after the event. The rule is enforced **on the
server**, by a single function of `@wishlist/domain` that every API calls, and covered by tests.
It also closes the indirect leaks: page titles and link previews never reflect the state of a list,
and the owner gets no notification of a contribution.

## Separation of the two apps

|                   | Public view                | Management app           |
| ----------------- | -------------------------- | ------------------------ |
| Host              | `<product>.<domain>`       | `app.<product>.<domain>` |
| API routes        | `/public/*`                | `/manage/*`              |
| Contribution data | after the anti-spoil check | never                    |

The API is internal: only the two frontends reach it, server side, and a NetworkPolicy enforces it.

## Defences in place

- Content Security Policy: `default-src 'none'` on the API; a nonce-based policy written by
  SvelteKit on the frontends, with `frame-ancestors 'none'`.
- `Referrer-Policy: no-referrer` everywhere, so that a share link token never leaks to another site.
- `X-Content-Type-Options`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, a `Permissions-Policy`
  that turns off the camera, microphone, location and payment.
- Cookies: the session shared between the two hosts is `__Secure-` (a `__Host-` cookie cannot be
  shared), `__Host-` is kept for host-only cookies such as CSRF.
- Containers: non-root user 10001, read-only root filesystem, no Linux capability, seccomp
  `RuntimeDefault`, no service account token, no npm in the runtime image.
- Supply chain: install scripts are allowed for esbuild only; Dependabot, CodeQL, `pnpm audit` and
  a Trivy scan of the images run in CI.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
