# Public view API

The routes of `/public/*`, which the public view calls server side for the guests who open a
share link. Like `/manage`, the API is internal: only the frontend reaches it (see
[Architecture](architecture.md)).

## The share link

The owner creates one link per guest or per group (« Mamie », « Les cousins ») in the management
app, for a list or for an event (see [Management API](api.md#share-links)). The guest opens
`https://<public host>/s/<token>`; the public view then sends the token to the API in the
`X-Share-Token` header, never in the URL, so that it stays out of the access logs.

Every route but `GET /public/ping` and `GET /public/home` needs a valid link. An unknown, revoked or expired link answers
`404 link_not_found`, the same in every case. The database only keeps the SHA-256 of the token.

### The open link of a public list

A list its owner made public (`visibility: public`, see [Management API](api.md#lists)) has one
**open link**, for anyone: a share link like the others, whose token is also kept in clear
(`share_links.open_token`), since its address is public by design and the home page gives it. It
opens the list only while the list is public and not archived; turning the list private revokes it.
Through it, `GET /public/view` answers `open: true` and `audience: "tout le monde"`, and names
nobody else's gift (`giverNameShown`, `@wishalia/domain`): a stranger never learns who in the
family gives. Gifts through an open link are limited to 5 a minute per address and per link
(`429 rate_limited`, with `Retry-After`), so that nobody reserves a whole list in one go. The open
link never shows in `GET /manage/share-links` and cannot be revoked there: the list's setting turns
it on and off.

## The home page

`GET /public/home?q=` gives the public host's home page what it shows: who is signed in
(`me.displayName`, from the shared session, or null) and the public lists, newest first, 24 at most
(`more` when there are others). Each gives the list's name and picture (`icon`, `image`: see
[Pictures of the lists](list-pictures.md)), its owner's name, how many wishes are open, and its open
link's `path` (`/s/<token>`): never anything about a gift. `q` (200 characters
at most, cut to 80) matches the start of the words of the owner's and the list's names, without
case or accents (`searchWords`, `matchesSearch`); under two letters, every public list is given. A
private list is never in the answer, whatever is searched. The answer is never cached
(`Cache-Control: private, no-store`).

## Who is looking

The API decides it with `resolveViewer` (`@wishalia/domain`), and the answer says it in `viewer`:

- `owner`: the owner of the link, recognised by their session (the cookie shared by the two hosts)
  or by the **device marker**, a signed cookie put on their device when they create or copy a link.
  The owner wins over the link. The public view shows them a warning, then the items **without
  any funding**.
- `guest`: anyone else with the link, with or without an account.

## Anti-spoil

A list is not always tied to an event, so a contribution may have none. Its secret is then kept by
the item and its list, as the owner chose for the list (`revealMode`, see
[Management API](api.md#lists)):

- `received` (default): it lifts when the owner marks the item received, since the gift has arrived;
- `manual`: it lifts when the owner lifts the secret of the list, whenever they decide. Marking an
  item received then lifts nothing.

The funding of an item (`funding`) is computed only after `canSeeContributions`, for every secret
that covers it: each event the item is in or got contributions in, and the item itself when it is
in no event or got contributions without one. One kept secret is enough to answer `funding: null`,
since a total or a state would give it away. The owner therefore gets `null` until every secret of
an item is lifted.

The items come in the owner's order, never sorted by funding: the public view puts complete items
last itself.

Between guests, a contribution shows its author's name (none when it is anonymous), never its
amount nor its message: those stay with their author (`mine`).

## Routes

| Route                                      | Body                                                                                                                        | Answer                                                                                                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /public/home?q=`                      | No share link                                                                                                               | Who is signed in, and the public lists (see above).                                                                                                      |
| `GET /public/view`                         |                                                                                                                             | The list (with its picture: `icon`, `image`) or the event, its events and its items, with `funding` or null.                                             |
| `GET /public/live`                         |                                                                                                                             | `{ version, live }`, never cached: see below.                                                                                                            |
| `POST /public/items/:itemId/contributions` | `eventId`?, `amountCents` (pool, or a share of a unique gift) , `units`? (quantity), `guestName`?, `message`?, `anonymous`? | `201`, the contribution and its `withdrawKey`, given once.                                                                                               |
| `DELETE /public/contributions/:id`         | header `X-Withdraw-Key`, or the session of its author                                                                       | `204`. Withdrawing twice changes nothing; anyone else gets `404`.                                                                                        |
| `POST /public/gifts/gone`                  | `{ gifts: [{ id, key }] }` (the device's withdraw keys, 30 at most), and the session                                        | The person's own gifts whose item left the owner's lists: `id`, `itemId`, `title`, `state` (`archived` or `deleted`), `eventId`, `amountCents`, `units`. |

Each item of the view carries `stage`: `reading` or `images` while it is completed from its link,
`null` otherwise (why a link failed is the owner's business). `GET /public/live` gives a fingerprint
of the link's items as shown and how many are on their way: the page asks it to follow them live
([Live updates](live-updates.md)). It is built from the items' own columns, never from
contributions.

A contribution:

- a pool takes any positive amount, beyond the target too (overshoot is allowed);
- a unique item takes one reservation, a repeatable one one per event;
- a unique item given once, with or without a price, may instead take shares: `amountCents` up to
  what is left of its price (`amount_too_high` beyond), or any positive amount without a price. It
  takes no share once reserved whole (`already_reserved`), and no whole reservation once shared
  (`already_shared`); an amount on a repeatable unique item is refused (`shares_not_taken`). Its
  `funding` then also carries `totalCents`, `remainingCents` and `byEvent`, as a pool's, measured
  against the price (`remainingCents` is null without a price, and such a gift stays `in_progress`
  once shared, never `complete`);
- a quantity item takes `units` copies, up to what is left (per event when it is repeatable);
- a guest without an account gives a name (`guestName`); with an account, their name is used;
- on a list link, `eventId` is optional: one of the item's events, or none; on an event link, it is
  the link's event;
- a contribution with an event is taken and withdrawn until the secret of its event is lifted
  (`event_closed`); one without an event while the item is open (`item_closed`) and the secret of
  the list is kept (`list_closed`);
- the item row is locked during the check, so the last copy is never reserved twice;
- an archived item takes nothing (it is out of the view), but a gift pledged to it can be withdrawn.

`POST /public/gifts/gone` answers only for gifts the person proves: by the session of their account,
or by each gift's withdraw key. A gift of a deleted item is given for 30 days after the deletion,
when the deletion cancelled it (the rule `goneGift` of `@wishalia/domain`). See
[Archiving and deleting](archive-delete.md).

Every contribution and every withdrawal writes a `sealed` history entry (`contribution_added`,
`reserved`, `contribution_withdrawn`) in its own transaction. The owner never receives any
notification of it.

## Errors

| Status | `error`                                                                                                                                                                           | When                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 400    | `invalid_request`                                                                                                                                                                 | A field is wrong or missing.                            |
| 403    | `owner_cannot_contribute`                                                                                                                                                         | The owner tries to contribute to their own items.       |
| 404    | `link_not_found`, `not_found`                                                                                                                                                     | No valid link, or an item or contribution out of reach. |
| 409    | `item_closed`, `already_reserved`, `already_shared`, `not_enough_left`, `amount_too_high`, `shares_not_taken`, `amount_required`, `units_required`, `event_closed`, `list_closed` | See above: a secret is already lifted.                  |
