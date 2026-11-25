# Management API

The routes of `/manage/*`, which the management app calls server side. The API is internal: these
routes are not reachable from the internet (see [Architecture](architecture.md)). The routes of the
share links are in [Public view API](public-api.md). The [REST API v1](rest-api.md), for scripts, serves
the same routes with personal access tokens.

Every route needs a session (see [Authentication](authentication.md)) and answers `401` without
one. Everything belongs to an owner: a list, an item or an event of someone else answers `404`,
exactly like a missing one, so that ids cannot be probed.

**Anti-spoil:** no response of `/manage` carries contribution data, ever. Items are serialised field
by field, never from a raw row. The history shows the contributions of an event only once its
secret is lifted (`canSeeHistoryEntry` in `@wishalia/domain`). Once it is, a contribution's entry
gives the amount or the copies, the guest's name (`null` when anonymous) and their word for the
owner (`message`, « À lire après l'occasion », `null` when none).

## Errors

JSON only: `{ "error": "<code>" }`, with `issues` (`path`, `message`) for a `400`.

| Status | `error`                                                                                 | When                                                         |
| ------ | --------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 400    | `invalid_request`                                                                       | A field is missing, invalid or unknown; an id is not a uuid. |
| 401    | `unauthenticated`                                                                       | No valid session.                                            |
| 404    | `not_found`                                                                             | Missing, or someone else's.                                  |
| 409    | `too_early`, `secret_already_lifted`, `repeatable_never_received`, `reveal_on_received` | See the routes below.                                        |
| 500    | `internal`                                                                              | Never with details: they go to the API log.                  |

## The signed-in person

| Route              | Body                              | Answer                                                                                        |
| ------------------ | --------------------------------- | --------------------------------------------------------------------------------------------- |
| `GET /manage/me`   |                                   | `id`, `displayName`, `email`, the display settings `theme` and `mode`, and `features.images`. |
| `PATCH /manage/me` | `displayName`?, `theme`?, `mode`? | The person. `theme`: `auto`, `neutral`, `christmas`; `mode`: `device`, `light`, `dark`.       |

## Lists

| Route                           | Body                                                                | Answer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /manage/lists`             |                                                                     | The lists in their order, with `itemCount` (open items).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `POST /manage/lists`            | `name`                                                              | `201`, the list, placed last.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `PATCH /manage/lists/:id`       | `name`, `position`, `archived`, `theme`, `revealMode`, `visibility` | The list. An archived list leaves `GET /manage/lists`. `visibility` (`private`, the default, or `public`): a public list is found by the public host's home page and gets an open link, given as `openUrl` (null while private); turning it private revokes that link, and turning it public again makes a new one. `theme` (`neutral`, `christmas` or `null`) is forced on everyone who opens the list; the light or dark mode stays personal. `revealMode` (`received` or `manual`) says how the secret of the contributions without an event lifts, and is frozen once lifted (`409`). |
| `POST /manage/lists/:id/reveal` |                                                                     | `manual` mode only (`409 reveal_on_received` otherwise): lifts that secret, for good.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `GET /manage/lists/:id/items`   |                                                                     | Its items: open first in their order, then received, archived.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `PUT /manage/lists/:id/order`   | `{ itemIds }`: every open item, once, in the new order              | `204`. `409 order_changed` when the ids are not exactly the open items (the list changed meanwhile): nothing moves. No history.                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## Items

| Route                                   | Body                                                                                                                   | Answer                                                                                                                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /manage/items`                    | `input` (URL and/or text), `listId`?                                                                                   | `201`, the item, plus `duplicateOf`: open items with the same link.                                                                                                                                   |
| `GET /manage/items/:id`                 |                                                                                                                        | The item.                                                                                                                                                                                             |
| `PATCH /manage/items/:id`               | `title`, `url`, `notes`, `priceCents`, `targetCents`, `quantity`, `kind`, `repeatable`, `status`, `listId`, `position` | The item.                                                                                                                                                                                             |
| `GET /manage/items/:id/history`         |                                                                                                                        | The history entries the owner may see, oldest first.                                                                                                                                                  |
| `GET /manage/items/:id/images`          |                                                                                                                        | `imageId`, `crop`, and `images`: the owner's own, then the page's, each with `source` and signed `sources`.                                                                                           |
| `PUT /manage/items/:id/image`           | the image itself (`image/*` or `application/octet-stream`), 10 MB at most                                              | The item, showing it. `415 not_an_image` (read from the bytes; never SVG), `413`, `422 image_too_large`, `503 images_off`.                                                                            |
| `PATCH /manage/items/:id/image`         | `imageId`? (one of the item's, or `null` for none), `crop`? (`{ x, y, width, height }` fractions, or `null`)           | The item. Another image starts whole. History: `image_changed`.                                                                                                                                       |
| `DELETE /manage/items/:id/image/upload` |                                                                                                                        | Removes the image the owner sent, file included. The item shows the page's first image (or none), and is queued for a fresh enrichment when it has a link. `404 no_upload`. History: `image_changed`. |

An item carries `image`: signed paths of its picture in three sizes (`small`, `medium`, `large`),
served by the frontends under `/img/`, or `null`; and `imageCrop`. The files' place (on the volume or
in the bucket) is never given. See [Images](images.md).

The quick add takes what the person typed or shared: a URL, free text, or text with a URL in it.
The item is created at once, first in its list (the first list of the owner when `listId` is left
out, created as "Mes envies" on the very first add). Until the enrichment finds the real title, a
bare URL gets the site name. A duplicate link is flagged, not refused: the app offers to undo.

URLs are cleaned before they are stored: tracking parameters (`utm_*`, `fbclid`, Amazon `tag`...)
and fragments go, and anything that is not an `http(s)` link is refused, so that a stored link can
never run code.

A `quantity` item needs a `quantity`. A repeatable item is never `received` (`409`).

### History entries written

| Change                           | Entry                                   | Payload                              |
| -------------------------------- | --------------------------------------- | ------------------------------------ |
| Quick add                        | `created`                               | `title`, `url`                       |
| Fields edited                    | `updated`                               | `changes`: `{ field: { from, to } }` |
| Price edited                     | `price_changed`                         | `from`, `to` (cents)                 |
| Moved to another list            | `moved`                                 | `from`, `to` (list ids)              |
| Status `received` / `archived`   | `received` / `archived`                 |                                      |
| Back to `open`                   | `updated`                               | `changes.status`                     |
| Added to / removed from an event | `added_to_event` / `removed_from_event` | `eventId`                            |

Each entry is written in the transaction of the change: a change is never stored without it.
Reordering (`position`) writes no entry.

## Events

| Route                                     | Body                                                         | Answer                                                                                |
| ----------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------- |
| `GET /manage/events`                      |                                                              | The events by date.                                                                   |
| `POST /manage/events`                     | `name`, `date` (YYYY-MM-DD), `kind`?, `revealDelayDays`? (3) | `201`, the event.                                                                     |
| `PATCH /manage/events/:id`                | the same fields                                              | The event. `date` and `revealDelayDays` are frozen once the secret is lifted (`409`). |
| `GET /manage/events/:id/items`            |                                                              | The items the event selects.                                                          |
| `PUT /manage/events/:id/items/:itemId`    |                                                              | `204`. Adding twice changes nothing.                                                  |
| `DELETE /manage/events/:id/items/:itemId` |                                                              | `204`, or `404` when the item was not selected.                                       |
| `POST /manage/events/:id/reveal`          |                                                              | Lifts the secret: the event, or `409 too_early` with `availableAt`.                   |

An event says where its secret stands: `revealAvailableAt` (the end of the event day, UTC, plus
the delay), `canReveal` and `secretLifted`. Lifting the secret is final.

## Share links

| Route                                 | Body                                                                         | Answer                                                                                 |
| ------------------------------------- | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| `GET /manage/share-links`             |                                                                              | The links, newest first, with `active`. Never their token.                             |
| `POST /manage/share-links`            | `scope` (`list` or `event`), `listId` or `eventId`, `audience`, `expiresAt`? | `201`, the link with its `token` and `url`, given once. A past `expiresAt` is a `400`. |
| `POST /manage/share-links/:id/revoke` |                                                                              | The link, revoked for good. Revoking twice changes nothing.                            |
| `POST /manage/device-marker`          |                                                                              | `204`. For the "copy the link" button.                                                 |

A link is made for one guest or one group (`audience`, such as « Mamie »), for one list or one
event. Creating a link, and `POST /manage/device-marker`, set the **device marker**: a cookie
(`__Secure-wishalia.owner_device`, HttpOnly, 400 days, on `COOKIE_DOMAIN`) holding the owner's id
signed with `AUTH_SECRET`. The public view recognises the owner by it even without a session, and
then shows no contribution. What the guests get is in [Public view API](public-api.md).
