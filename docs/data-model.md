# Data model

The tables, defined in [packages/db/src/schema.ts](../packages/db/src/schema.ts) and created by the
versioned migrations of `packages/db/migrations`. Amounts are integers in cents.

| Table                | Role                                                                                                                                                                                                                                                                                                                                                                                                                  |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `users`              | An account. Owner of its lists, guest on the others: the role is per list or event. A deleted account is anonymised, never removed. Keeps the person's `theme`, `mode` and `locale` (null: the browser's language).                                                                                                                                                                                                   |
| `wish_lists`         | A durable list ("Books", "Home"), ordered by `position`, with an optional forced `theme`, its `visibility` (`private` by default, or `public`: found by the home page) and its picture: an `icon` (null: the default) or the owner's image (`image_key`, see [Pictures of the lists](list-pictures.md)). `archived_at` (hidden, restorable) and `deleted_at` (for good, archived too; the row stays for the history). |
| `wishes`             | An item: `kind` (`unique`, `quantity`, `pool`), `repeatable`, price, pool target, quantity, optional series volume, the image shown (`image_id`) and its frame (`image_crop`), what the worker last wrote from the page (`found_title`, `found_price_cents`), `deleted_at` (deleted for good: `archived`, emptied of its link, notes and images), and where its completion stands (`enrichment`, `enrichment_step`).  |
| `wish_images`        | The images of an item: up to four from the page of its link (`page`), and the one the owner sent (`upload`). Their files are on the volume or in the bucket under `key`. See [Images](images.md).                                                                                                                                                                                                                     |
| `series`             | An ordered group of items (book volumes), with the external ids (ISBN, Open Library).                                                                                                                                                                                                                                                                                                                                 |
| `events`             | A dated occasion (`birthday`, `christmas`, `other`), its reveal delay and when the secret was lifted.                                                                                                                                                                                                                                                                                                                 |
| `event_wishes`       | The items an event selects. An event never owns an item.                                                                                                                                                                                                                                                                                                                                                              |
| `contributions`      | A guest's pledge on an item, within an event or without one: an amount (pool) or copies (unique, quantity). Keeps the SHA-256 of its withdraw key.                                                                                                                                                                                                                                                                    |
| `share_links`        | A share link for one list or one event, per guest or group. Only the SHA-256 hash of the token is stored, except for the open link of a public list (`open_token`), public by design.                                                                                                                                                                                                                                 |
| `api_tokens`         | A personal access token of the REST API v1: its name, prefix, expiry and read-only flag. Only the SHA-256 hash of the token is stored.                                                                                                                                                                                                                                                                                |
| `item_events`        | The append-only history of every item, with its visibility.                                                                                                                                                                                                                                                                                                                                                           |
| `auth_sessions`      | A signed-in device (Better Auth). Deleting the row signs the device out.                                                                                                                                                                                                                                                                                                                                              |
| `auth_accounts`      | A sign-in method from the OIDC provider. Its OAuth tokens are encrypted; no password is ever stored.                                                                                                                                                                                                                                                                                                                  |
| `auth_verifications` | Short-lived secrets: the magic links, stored hashed.                                                                                                                                                                                                                                                                                                                                                                  |
| `auth_passkeys`      | A passkey (WebAuthn credential): only its public key.                                                                                                                                                                                                                                                                                                                                                                 |

## Rules enforced by the database

- `item_events` rejects every `UPDATE`, `DELETE` and `TRUNCATE` (trigger of migration 0001).
- A quantity item has a positive quantity; a pool target, when set, is positive.
- A series volume has both a series and a number.
- A contribution names someone (an account or a guest name) and pledges something (an amount or copies).
- A share link targets exactly one list or one event; token hashes are unique. An open link
  (`open_token`) is always a list's.

## Computed, never stored

"Funded" is always derived from the active contributions, by `@wishalia/domain`:

| Function                                      | Result                                                                                                               |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `totalFunded`, `remainingToFund`, `overshoot` | Pool totals over every event. Overshoot is allowed.                                                                  |
| `fundingByEvent`                              | The segments of the pool bar, one per event.                                                                         |
| `reservedUnits`, `timesGiven`                 | Copies reserved, and how many events a repeatable item was given at.                                                 |
| `progress`, `itemState`                       | `free`, `in_progress`, `almost` (80 % and more) or `complete`. A repeatable item is judged on the event shown.       |
| `goneGift`                                    | What a guest is told of their gift whose item was archived or deleted ([Archiving and deleting](archive-delete.md)). |

The anti-spoil functions are described in [Security](security.md).

## History visibility

| Visibility | Shown to guests | Shown to the owner                                                                               | Used for                                          |
| ---------- | --------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------- |
| `owner`    | yes             | yes                                                                                              | Creation, edits, price changes, moves.            |
| `guests`   | yes             | never                                                                                            | Guest-side events that must stay hidden for good. |
| `sealed`   | yes             | once the secret is lifted (event; without one, item received or list revealed, as the list says) | Contributions and reservations.                   |

## Commands

```sh
pnpm --filter @wishalia/db db:generate   # a new migration from the schema
pnpm --filter @wishalia/db db:migrate    # apply the migrations to DATABASE_URL
pnpm --filter @wishalia/db db:seed       # demo data (refused when NODE_ENV=production)
```

The schema tests run the real migrations on an in-memory PostgreSQL (PGlite), so the CI needs no
database server.
