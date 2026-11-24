# REST API v1

A REST API for scripts and home automation (Home Assistant, a shortcut that adds an item, a
dashboard). It serves the lists, items and events of the owner of a token, on its own host, and
**never any contribution data**: it has the rights of the management app, through the same routes
(see [Management API](api.md)).

The API v1 is off until `hosts.api` is set in the chart (see [Chart values](chart-values.md)). The
ingress then forwards `/v1` only on that host, and the API refuses everything else there:
`/manage`, `/public` and `/auth` stay internal.

## Personal access tokens

An owner creates a token in the management app (« Réglages »), gives it a name (« Home Assistant ») and a
lifetime of 1 to 365 days (90 by default), and may make it **read-only**. The token is shown once:
only its SHA-256 is stored, with its first characters (`wsh_Ab3d`) to recognise it. It can be
revoked at any time, for good.

| Route                                | Body                                       | Answer                                                    |
| ------------------------------------ | ------------------------------------------ | --------------------------------------------------------- |
| `GET /manage/api-tokens`             |                                            | The tokens, newest first, with `active` and `lastUsedAt`. |
| `POST /manage/api-tokens`            | `name`, `expiresInDays`? (90), `readOnly`? | `201`, the token with its `token`, given once.            |
| `POST /manage/api-tokens/:id/revoke` |                                            | The token, revoked. Revoking twice changes nothing.       |

A token never creates another one: these routes are only in `/manage`, behind a session.

## Calling the API

```sh
curl -H "Authorization: Bearer wsh_..." https://api.wishalia.example.com/v1/lists
curl -X POST -H "Authorization: Bearer wsh_..." -H "Content-Type: application/json" \
  -d '{"input": "https://example.com/une-lampe"}' https://api.wishalia.example.com/v1/items
```

- Only the `Authorization: Bearer` header authenticates: a session cookie is ignored, so no browser
  can be made to call the API on someone's behalf.
- A missing, wrong, expired or revoked token answers `401 invalid_token`; a read-only token answers
  `403 read_only_token` to anything but `GET`.
- Each token has `API_RATE_LIMIT` requests a minute (120 by default, per API replica), then gets
  `429 rate_limited` with `Retry-After`. Every answer carries `RateLimit-Limit`,
  `RateLimit-Remaining` and `RateLimit-Reset`. Wrong tokens are counted per address, which slows guessing down.

## Routes

The description is served at `GET /v1/openapi.json` (OpenAPI 3.1, no token needed): import it in
any OpenAPI client. Its request bodies come from the schemas the routes validate with.

| Route                                                   | What                                                                 |
| ------------------------------------------------------- | -------------------------------------------------------------------- |
| `GET /v1/me`                                            | The owner of the token.                                              |
| `GET`, `POST /v1/lists`; `PATCH /v1/lists/:id`          | Lists.                                                               |
| `GET /v1/lists/:id/items`; `POST /v1/lists/:id/reveal`  | Items of a list; lifting its secret (manual).                        |
| `POST /v1/items`; `GET`, `PATCH /v1/items/:id`          | Quick add and edits of items.                                        |
| `GET /v1/items/:id/history`                             | The history, without any sealed entry, even once a secret is lifted. |
| `GET`, `POST /v1/events`; `PATCH /v1/events/:id`        | Events.                                                              |
| `GET /v1/events/:id/items`; `PUT`, `DELETE .../:itemId` | The items an event selects.                                          |
| `POST /v1/events/:id/reveal`                            | Lifting the secret of an event.                                      |

The answers and errors are those of the [Management API](api.md). Share links and tokens are not in
the API v1.
