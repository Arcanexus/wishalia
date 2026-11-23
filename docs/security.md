# Security

Security is the first of the three priorities of the project, before ease of use and performance.

## The anti-spoil rule

The owner of a list never sees the contributions to their items: no amount, no name, no
percentage, no history, until they lift the secret after the event. The rule is enforced **on the
server**, by a single function of `@wishalia/domain` that every API calls, and covered by tests.

| Viewer            | Recognised by                                                                 | Sees the contributions                                                                                           |
| ----------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Owner             | their session, or the device marker set when they create or copy a share link | only once they lift the secret, possible from the end of the event day plus the reveal delay (3 days by default) |
| Guest             | a valid share link (not revoked, not expired)                                 | yes, before and after the event                                                                                  |
| Anonymous visitor | neither                                                                       | yes, folded behind a confirmation click                                                                          |

Owner detection wins: an owner opening their own share link is still the owner. The functions are
`resolveViewer`, `canSeeContributions` and `canSeeHistoryEntry`; the history visibilities are in
[Data model](data-model.md).
It also closes the indirect leaks: page titles and link previews never reflect the state of a list,
the owner gets no notification of a contribution, and no Prometheus metric describes contributions
(see [Monitoring](monitoring.md)).

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
- Sign-in: no password anywhere; OIDC, passkeys and single-use magic links (stored hashed), on
  invitation only. Origin and CSRF checks always on, rate limit on `/auth/*`. See
  [Authentication](authentication.md).
- Ownership: every `/manage` route checks the owner and answers 404 for anything else, so that ids
  cannot be probed. Stored links are cleaned and limited to `http(s)`. Errors never carry details.
- Share links: only the SHA-256 hash of a token is stored, so a database leak opens no list.
- History: `item_events` is append-only, enforced by a database trigger.
- Metrics: `/metrics` listens on a port of its own that the ingress never routes, and only the
  `metrics.allowFrom` peers may scrape the API and the worker. Labels carry route patterns, never a
  URL, so no id or share link token ends up in Prometheus.
- Containers: non-root user 10001, read-only root filesystem, no Linux capability, seccomp
  `RuntimeDefault`, no service account token, no npm in the runtime image.
- Supply chain: install scripts are allowed for esbuild only; Dependabot, CodeQL, `pnpm audit` and
  a Trivy scan of the images run in CI.

## Reporting a vulnerability

See [SECURITY.md](../SECURITY.md).
