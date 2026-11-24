# Security

Security is the first of the three priorities of the project, before ease of use and performance.

## The anti-spoil rule

The owner of a list never sees the contributions to their items: no amount, no name, no
percentage, no history, until they lift the secret after the event. The rule is enforced **on the
server**, by a single function of `@wishalia/domain` that every API calls, and covered by tests.

| Viewer | Recognised by                                                                 | Sees the contributions                                                                                                                                                                                                                     |
| ------ | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Owner  | their session, or the device marker set when they create or copy a share link | only once they lift the secret, possible from the end of the event day plus the reveal delay (3 days by default); without an event, as the list says: once they mark the item received (default), or once they lift the secret of the list |
| Guest  | a valid share link (not revoked, not expired)                                 | yes, before and after the event                                                                                                                                                                                                            |

Without a valid link, the public view shows nothing at all: every `/public` route but a ping
answers `404`. The device marker is an HMAC of the owner's id with `AUTH_SECRET`, so nobody can
forge the marker of someone else; changing `AUTH_SECRET` drops every marker and every session.
Owner detection wins: an owner opening their own share link is still the owner. The owner may still
open their link on a device that knows nothing of them (a borrowed phone, a private window): for a
visitor without an account, nothing given on this device and no answer yet, the public view leaves
the funding **out of the page** until they say « Je ne suis pas Léa » (see
[Public view](public-view.md#a-visitor-nobody-knows)). The functions are
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

The [REST API v1](rest-api.md), when on, has its own host (`hosts.api`): the ingress only forwards
`/v1` there, and the API refuses any other route on that host. It authenticates by personal access
token only, never by cookie, and has the rights of the management app: no contribution data.

The API is internal: only the two frontends reach it, server side, and a NetworkPolicy enforces it.

## Defences in place

- Content Security Policy: `default-src 'none'` on the API; a nonce-based policy written by
  SvelteKit on the frontends, with `frame-ancestors 'none'`.
- `Referrer-Policy: same-origin` on the two frontends (`no-referrer` on the API), so that a share link
  token never leaks to another site. Not `no-referrer` on the frontends: browsers would then send
  `Origin: null` with a plain form, which the CSRF check refuses.
- `X-Content-Type-Options`, `X-Frame-Options`, `Cross-Origin-Opener-Policy`, a `Permissions-Policy`
  that turns off the camera, microphone, location and payment.
- Cookies: the session shared between the two hosts is `__Secure-` (a `__Host-` cookie cannot be
  shared), `__Host-` is kept for host-only cookies such as CSRF.
- Sign-in: no password anywhere; OIDC, passkeys and single-use magic links (stored hashed), on
  invitation only. Origin and CSRF checks always on, rate limit on `/auth/*`. See
  [Authentication](authentication.md).
- Ownership: every `/manage` route checks the owner and answers 404 for anything else, so that ids
  cannot be probed. Stored links are cleaned and limited to `http(s)`. Errors never carry details.
- Personal access tokens: only their SHA-256 hash is stored, they always expire (a year at most),
  can be read-only, revoked, and are rate limited per token.
- Share links: only the SHA-256 hash of a token is stored, so a database leak opens no list. The
  token travels in a header (`X-Share-Token`) between the public view and the API, never in an API
  URL. The withdraw key of a contribution is stored the same way.
- Images: the worker fetches a page's images through the same SSRF guard as the page, and every
  image (the page's or the owner's) is read from its bytes: JPEG, PNG, WebP, GIF, AVIF or HEIC only,
  never SVG, 10 MB and 50 megapixels at most. Browsers only get signed imgproxy paths, served on
  the frontends' own host (`img-src 'self'`); imgproxy reads only the image files (the volume, read-only, or the bucket), is reachable only from
  the two frontends, and drops EXIF data. See [Images](images.md).
- Installed app: the share menu only fills the « Ajouter une envie » page (a `GET`), it never adds a
  wish by itself, so no other site can add one by sending someone to `/ajouter`; the add is a form
  post behind SvelteKit's CSRF check. The service worker caches only the app's code and static
  files, never a page, an API answer or an image, and leaves every other request to the network.
  The manifest is public and holds only the app's name. See [Install the app](install-app.md).
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
