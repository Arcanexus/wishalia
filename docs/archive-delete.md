# Archiving and deleting

Every list and every item can be **archived** (hidden, and restorable) or **deleted** (for good).
Both are always possible, whatever was given: refusing, or even warning the owner that someone
meant to give it, would give the gift away ([anti-spoil](security.md)). The guests who meant to give
it are the ones who are told, on their own link.

|                         | Archived                                                    | Deleted                                         |
| ----------------------- | ----------------------------------------------------------- | ----------------------------------------------- |
| The owner               | Under « Reçues et archivées » or « Listes archivées »       | Gone from every screen and from the API (`404`) |
| The guests              | No longer see it                                            | No longer see it                                |
| Gifts pledged to it     | Kept, in case it comes back; the guest may take theirs back | Cancelled                                       |
| Images                  | Kept                                                        | Removed, files included                         |
| Events                  | Kept                                                        | It leaves them                                  |
| Share links (of a list) | Open nothing while archived                                 | Revoked                                         |
| Back                    | One tap: restored as it was                                 | Never                                           |

## In the management app

On a list page, each item has its buttons as icons, with their words on hover and on keyboard focus:

- the box, « Archiver »: the item goes under « Reçues et archivées »;
- the bin, « Supprimer », in the colour of danger: it opens a dialog that says what goes, that it
  cannot be undone, and that relatives who meant to give it are told on their link. « Annuler »
  comes first and has the focus; Escape closes the dialog too. « Supprimer définitivement » deletes.

Under « Reçues et archivées », the arrow coming back (« Remettre dans la liste ») restores an item,
and the bin deletes it the same way.

![A wish's buttons and the dialog before deleting it](images/app-delete-item.png)

A list is archived from its settings (« Archiver la liste », behind a box to tick). It then waits on
the home page under « Listes archivées », folded, with the arrow to restore it (with its items,
settings and share links, as it was) and the bin to delete it. « Supprimer la liste », at the end
of the list's settings, deletes it directly, behind a box to tick.

![The archived lists on the home page](images/app-archived-lists.png)

## On the guests' side

An archived or deleted item leaves the guests' view at once, on the list's links and on the events'.
An archived list's links open nothing until it is restored; a deleted list's links are revoked.

A guest who had pledged something to an item that left the list is told at the top of their link,
in « Des envies ont quitté la liste », so that they do not buy it:

- **archived**: « « Vélo » n'est plus sur la liste pour le moment : inutile de l'acheter. Votre
  participation est gardée au cas où elle revienne ; vous pouvez aussi la reprendre. »
  « Reprendre ma participation » takes it back, with the same rules as « Me retirer ». Restored,
  the item comes back with the gifts that were kept;
- **deleted**: « « Vélo » a été retirée de la liste : votre participation est annulée, inutile de
  l'acheter. », said for 30 days. « Compris » makes this device forget it.

Only the person's own gifts are said: those of their account, and those their device proves with
the withdraw key it keeps ([Withdrawing](public-view.md#withdrawing)). Nobody learns anything about
someone else's gifts, and the owner learns nothing at all.

![A relative told that a gift left the list](images/public-gone.png)

## What stays

The history of an item is append-only ([Data model](data-model.md)): a deletion adds a `deleted`
entry, and each gift it cancels a sealed `contribution_withdrawn` entry with `reason: "item_deleted"`.
So the rows of a deleted item and list stay, marked `deleted_at`, with their title (for the guests'
notice); the item's link, notes, images and place in the events go. Nothing shows them again.

## API

| Route                                    | What                                                                                       |
| ---------------------------------------- | ------------------------------------------------------------------------------------------ |
| `PATCH /manage/items/:id` `{ status }`   | `archived` archives, `open` restores.                                                      |
| `DELETE /manage/items/:id`               | `204`: deleted for good. `404` once deleted.                                               |
| `PATCH /manage/lists/:id` `{ archived }` | `true` archives, `false` restores.                                                         |
| `GET /manage/lists?archived=true`        | The archived lists, never the deleted ones.                                                |
| `DELETE /manage/lists/:id`               | `204`: the list and its items, deleted for good. `404` once deleted.                       |
| `POST /public/gifts/gone`                | The person's own gifts whose item left the list ([Public view API](public-api.md#routes)). |

The [REST API v1](rest-api.md) has the same `GET`, `PATCH` and `DELETE` routes, with a token that
is not read-only.
