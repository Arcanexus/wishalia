# Public view API

The routes of `/public/*`, which the public view calls server side for the guests who open a
share link. Like `/manage`, the API is internal: only the frontend reaches it (see
[Architecture](architecture.md)).

## The share link

The owner creates one link per guest or per group (« Mamie », « Les cousins ») in the management
app, for a list or for an event (see [Management API](api.md#share-links)). The guest opens
`https://<public host>/s/<token>`; the public view then sends the token to the API in the
`X-Share-Token` header, never in the URL, so that it stays out of the access logs.

Every route but `GET /public/ping` needs a valid link. An unknown, revoked or expired link answers
`404 link_not_found`, the same in every case. The database only keeps the SHA-256 of the token.

## Who is looking

The API decides it with `resolveViewer` (`@wishalia/domain`), and the answer says it in `viewer`:

- `owner`: the owner of the link, recognised by their session (the cookie shared by the two hosts)
  or by the **device marker**, a signed cookie put on their device when they create or copy a link.
  The owner wins over the link. The public view shows them a warning, then the items **without
  any funding**.
- `guest`: anyone else with the link, with or without an account.

## Anti-spoil

The funding of an item (`funding`) is computed only after `canSeeContributions`, for every event
the item is in or got contributions in. One sealed event is enough to answer `funding: null`, since
a total or a state would give it away. The owner therefore gets `null` everywhere until they lift
the secret of every event of an item, and `null` for an item in no event.

The items come in the owner's order, never sorted by funding: the public view puts complete items
last itself.

Between guests, a contribution shows its author's name (none when it is anonymous), never its
amount nor its message: those stay with their author (`mine`).

## Routes

| Route                                      | Body                                                                                          | Answer                                                                   |
| ------------------------------------------ | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `GET /public/view`                         |                                                                                               | The list or the event, its events and its items, with `funding` or null. |
| `POST /public/items/:itemId/contributions` | `eventId`?, `amountCents` (pool), `units`? (quantity), `guestName`?, `message`?, `anonymous`? | `201`, the contribution and its `withdrawKey`, given once.               |
| `DELETE /public/contributions/:id`         | header `X-Withdraw-Key`, or the session of its author                                         | `204`. Withdrawing twice changes nothing; anyone else gets `404`.        |

A contribution:

- a pool takes any positive amount, beyond the target too (overshoot is allowed);
- a unique item takes one reservation, a repeatable one one per event;
- a quantity item takes `units` copies, up to what is left (per event when it is repeatable);
- a guest without an account gives a name (`guestName`); with an account, their name is used;
- on a list link, the event is required when the item is in several (`400 event_required`); on an
  event link, it is the link's event;
- the item row is locked during the check, so the last copy is never reserved twice.

Every contribution and every withdrawal writes a `sealed` history entry (`contribution_added`,
`reserved`, `contribution_withdrawn`) in its own transaction. The owner never receives any
notification of it.

## Errors

| Status | `error`                                                                                                               | When                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 400    | `invalid_request`, `event_required`                                                                                   | A field is wrong, or the event is missing.              |
| 403    | `owner_cannot_contribute`                                                                                             | The owner tries to contribute to their own items.       |
| 404    | `link_not_found`, `not_found`                                                                                         | No valid link, or an item or contribution out of reach. |
| 409    | `item_closed`, `already_reserved`, `not_enough_left`, `amount_required`, `units_required`, `no_event`, `event_closed` | See above. `event_closed`: its secret is lifted.        |
