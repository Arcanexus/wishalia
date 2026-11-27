# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Help on every page: a question mark in the header opens the user guide and the guide's sections
  about the page in hand (« Sur cette page »), and a small « ? » beside a few settings explains them
  in one sentence.
- Text size: « Taille du texte » in the display menu (A, A+, A++: 100 %, 112.5 %, 125 %), kept on
  the device (`wishalia.text`) and applied by the server, on both frontends.
- Lighter wish cards: the heart and the pencil stay, the rest (read the link again, archive, delete)
  goes into a « ⋯ » menu. « Réorganiser » turns the list into short rows with a handle and arrows,
  « Terminé » brings the cards back (`?ordre`, also without JavaScript).
- A search in one's wishes, past three of them, by name, notes or volume name.
- A barcode scan in the quick add, where the browser reads barcodes: a book's ISBN adds its Open
  Library page, completed like any link. The management app's `Permissions-Policy` allows the
  camera for its own pages (`camera=(self)`).
- Sharing: « Envoyer… » opens the phone's share menu, and every new link has a QR code, drawn on
  the server, to print or save as an SVG image.
- Series: the volumes show as tiles, for the owner (pencil and « ⋯ » menu on each, small tiles with
  « ‹ » « › » in the reorder mode) and for the guests (« Offrir » on each tile). Guests can buy every
  free volume at once: « Offrir les 3 tomes restants · 26,85 € » (two to twenty volumes).
- Several copies: « × 4 » with the copies' icon on the guests' cards, the turning arrows beside
  « À chaque occasion », and « − » « + » around the number, in the owner's editor and in the
  guests' form (instead of a list to pick from).
- Deleting a wish, a series or a volume no longer asks first: it leaves the screen at once, and
  « Annuler » brings it back for eight seconds (the time stops while the message is pointed at or
  focused), before anything is sent or any guest is told. A list's deletion keeps its dialog.
- Filters on the guests' page: « À offrir », an occasion, « Prix » (the cheapest first) and « Mes
  cadeaux », with how many wishes show. Never for the owner nor on a folded page.
- The changes made on a list (delete, received, archived, reopened, reordered, a volume moved)
  show at once and are saved in the background, one after the other: moving to another page does
  not stop them, a lost network or a server away makes them wait and go again by themselves, and
  they are kept on the device for the next visit. An icon in the header says when changes are on
  their way or waiting (tap it to try again now), and a message says when one could not be saved.
- At the foot of every page, on both frontends: « Aide : le guide d'utilisation » (« Help: the user
  guide »), which opens the new user guide of the wiki in the page's language
  ([User guide](docs/user-guide.md), [Guide d'utilisation](docs/guide-utilisateur.md)), and the
  version that runs. `config.helpUrl` (`HELP_URL`) leads the help link to a server's own page.
- Changing a series' image offers every image of its volumes, volume by volume, each named after
  its volume (« T30, image 2 »); the one chosen shows on the series' card, for the guests too. API:
  `volume` on each image of `GET /manage/items/:id/images`.

### Fixed

- A series' tiles no longer cut their names letter by letter: each volume is named « Tome 33 » from
  the number in its title (its whole title on hover), on its own line, with the price and the badge
  under it, the shop's name alone (« fnac.com ») and the button at the foot of every tile.
- Reordering a list no longer jumps back: moves made quickly in a row (arrows tapped several times,
  a second drag while the first is saving) go one after the other with the latest order, and the
  page keeps showing that order until it is saved. The arrows send the order on screen, so two taps
  no longer overwrite each other on the server. An order a moment behind (a wish added or deleted
  on the way) is merged instead of refused (`PUT /manage/lists/:id/order`).
- Deleting a wish takes it off the page at once, instead of leaving it until the list loaded again.
- The built-in Garage stays in its Service through a short stall: on a slow volume (NFS) a burst
  of uploads or deletions could hold `/health` past its ten seconds and take Garage out for a
  while, so images failed to load. Readiness now waits twelve failures (two minutes) instead of
  three.
- Dragging a wish by its handle moves it as many places up or down as wanted in one go: it used to
  stop after one place, as the card moved under the finger or the pointer.
- Adding a volume to a series no longer folds its card: it unfolds to show the new volume, and a
  series unfolded by hand stays so as the page reloads.

### Changed

- The image files of a deleted wish or list are removed in the background, after the answer; the
  worker's periodic cleanup removes any file left behind.

### Removed

- The guests' sentence « Ce que vous offrez reste secret pour …, jusqu'après l'occasion. », at the
  bottom of their page and of the owner's preview.

## [0.0.9] - 2026-11-26

### Added

- A fourth kind of wish, « Une série » (« A series »): the volumes of a book, comic or manga series,
  or of a collection, on **one card**, like a gift wanted in several copies. Each volume keeps its own
  name or number, price, link, images and history, and the guests give the volumes one by one, each
  with the same « Acheter / Participer » button (see [Series](docs/series.md)).
- Existing wishes go into a series: « Une série » in a wish's editor makes it the first volume of a
  new series, named after it without its number (« Dragon Ball Perfect Edition T30 » → « Dragon Ball
  Perfect Edition »), and the series' « Ranger des envies dans la série » ticks the wishes whose name
  starts like it, in their reading order. A field on the card adds a new volume; icons move a volume
  up or down, take it out, undo the series, archive or delete it with its volumes.
- The volumes fold under « 5 tomes » on both cards, the owner's and the guests'; the field that adds
  a volume stays visible. The guests see one box per volume, filled once it is given, as for a gift
  wanted in several copies; a complete series goes down the list. An event
  selects a series whole, with every volume.
- API: `parentId` on every item and `kind: "series"`; `POST /manage/lists/:id/series`,
  `POST /manage/items/:id/volumes`, `PUT /manage/items/:id/order`, `POST /manage/items/:id/ungroup`,
  `parentId` in the quick add and `PATCH /manage/items/:id`, the same on the REST API v1 (OpenAPI).
  History entries `grouped` and `ungrouped`. Migration `0016_series` (`wishes.parent_id`).

## [0.0.8] - 2026-11-26

### Changed

- Every outside image is on its latest stable release. Node.js 26 (LTS) builds and runs the four
  images (`.nvmrc` and `@types/node` too); it no longer ships Corepack, so the Dockerfile and the CI
  install it from npm (0.36.0) before enabling pnpm. The chart's PostgreSQL moves to 19
  (`postgres:19-alpine`), Garage to v2.6.0 and BusyBox (`volumePermissions`) to 1.38.0; imgproxy
  v4.0.25, the Garage console v0.14.0 and the GitHub Actions were already the latest.
- The chart moves the data of the built-in PostgreSQL to the new major version by itself
  (`postgresql.upgrade`, on by default): two init containers dump it with the previous image
  (`postgresql.upgrade.fromImage`, `postgres:18-alpine`) and restore it into the new one, once,
  before the server starts. The folder of PostgreSQL 18 is kept, to go back. See
  [Upgrading PostgreSQL](docs/installation.md#upgrading-postgresql). A CI job runs the upgrade for
  real, from data written by PostgreSQL 18.
- `docker compose up` starts Garage (v2.6.0) instead of MinIO, whose community image is no longer
  published, with local keys in Garage's format (`.env.example`). A local database made with
  PostgreSQL 18 stays beside the new one: `docker compose down -v` starts afresh.
- In the guests' view, every item has the same « Acheter / Participer » button (« Buy / Chip in »),
  whatever its kind, and every form is sent with « Valider ». A gift given once works the same with
  or without a price: the same short form, « Je l'achète en entier » or « Je participe avec un
  montant ». Without a price, the shares take any amount (« 45 €
  réunis, avec Paul. », with no bar) and the gift stays partly given until the owner marks it received.
  `POST /public/contributions` takes an `amountCents` on any unique gift given once.
- Every card of the guests' view and of the preview keeps its square: an empty frame when the item
  has no image, so that the titles and the buttons start at the same place on every card.

### Fixed

- Accents written as HTML entities (« liste &agrave; jour ») show as letters: the importer and the
  worker know every Latin-1 entity and the usual typographic ones (« &rsquo; », « &euro; »…), and
  migration 0015 decodes the titles, notes and list names already saved.

## [0.0.7] - 2026-11-26

### Added

- Each list shows a picture next to its name: one of sixteen icons drawn in the theme's colours
  (gift, tree, bauble, snowflake, star, heart, cake, birth, wedding, home, books, games, music,
  travel, sport, pets), or an image the owner sends (JPEG, PNG, WebP, GIF, AVIF or HEIC, 10 MB at
  most, shown as a square). It shows on the lists, on the list's page, in the preview, on the
  family's page and in the public search. The picture next to a list's title, or « Changer
  l'image » in its settings, opens « Image de la liste ». API: `icon` in `PATCH /manage/lists/:id`,
  `PUT` and `DELETE /manage/lists/:id/image`, `icon` and `image` on every list (also in v1,
  `/public/view` and `/public/home`). Migration 0014 adds `wish_lists.icon` and `image_key`; the
  worker's cleanup also sweeps `lists/`.
- Settings save as they change, with no « Enregistrer » button: the account's name, theme, mode and
  language, a list's settings, an item being edited, an event's settings, a passkey's name, a list's
  icon, the image chosen for an item and its framing. Typing waits for a short pause, a choice goes
  at once, and a discreet line says « Enregistrement… », « Enregistré », or what to fix, with
  « Réessayer »; nothing typed is lost, and a form keeps its button without JavaScript.
- The header has two menus at the top right, as icons: the display (mode, theme and language) and
  the account (its settings, signing out). The public home page has an icon to sign in, or the
  account menu once signed in; the guests' page has the display menu. `/preferences` takes the
  `mode` or the `theme` the menu names.

### Changed

- The items of a list share one grid: the arrows, a square for the image (kept empty, as a frame,
  for an item without one), the words, then icons always in the same order and lined up: a heart
  (« Je l'ai reçu »), a pencil (« Modifier »), the reload arrows, a box, a bin. A small pencil over
  the image's corner leads to its images, as the count of images sits over the other corner.
- A list's settings open from a cog next to its title; archiving and deleting the list are a box
  and a bin there (deleting asks in a dialog). The list cards on the home page have an arrow and
  line up.
- The header's « Réglages » and « Se déconnecter » moved into the account menu; the mode button and
  the language buttons into the display menu.

## [0.0.6] - 2026-11-26

### Added

- Any gift that has a price can be shared: on the guests' page, « Je l'offre ou je participe »
  offers to give it whole or to give part of it with an amount, up to what is left of the price.
  Its bar fills up to the price, « 20 € réunis sur 49,90 € : il manque 29,90 €, avec Paul. », and
  once shared it is completed by amounts only. The owner has nothing to switch on; the item editor
  says it. A gift for every occasion is still reserved whole. API: `amountCents` on a unique item,
  new refusals `already_shared`, `amount_too_high`, `shares_not_taken`.
- An icon next to each item's price says where it stands at a glance: a gift (nobody takes care of
  it yet), a half disc (partly given), a check (already given), a heart (received), with its words
  on hover and for a screen reader.
- An item's image opens big, in the page, on the owner's lists, in the preview and on the family's
  page: the image shown, whole, then the item's other images (those found on the page of its link,
  Amazon's gallery included), with arrow buttons and dots, the arrow keys, Home and End, or a swipe.
  The cross, Escape or a click outside the frame closes it, and the focus goes back to the image. A
  real modal dialog, named for a screen reader; nothing big is loaded before it opens. Every item's
  `image` (management API, REST API v1 and the public view) now carries `gallery`, the signed paths
  of its other images, whole (seven at most).
- The pages follow the reading of links live, with no reload: the list page, the image page of an
  item and the guests' page. Each step has its own icon, its words next to it and the longer help
  on hover: a chain link in a turning ring for « Lecture du lien… », a picture for « Recherche des
  images… » (the title and price are already shown), a warning sign for « Lien illisible ». A
  screen reader hears each change once, politely (« « Lampe » : titre et prix trouvés. »), and the
  guests' page says « Mise à jour depuis le lien… » then that the item is up to date. The page asks
  its own server a few-byte question (`{ version, live }`) every 2 seconds, then 10, only while an
  item is on its way and the tab is shown, and reloads only when something moved, never under a
  wish being edited or a gift being written. API: `GET /manage/lists/:id/live`, `GET /public/live`,
  `enrichmentStep` on the items, `stage` on the guests' items. The fingerprint never moves with a
  contribution (anti-spoil). See [Live updates](docs/live-updates.md).
- The worker writes the title and the price as soon as the page is read, then fetches the images:
  migration 0012 adds `enrichment_step` to the items.
- Every list and every wish can be archived and restored, or deleted for good. A wish has a box
  (« Archiver ») and a bin (« Supprimer », after a dialog that says it cannot be undone); archived
  and received wishes come back with the arrow. Archived lists wait on the home page under « Listes
  archivées », to restore or delete; « Supprimer la liste » is in the list's settings. A deletion
  removes the wish from its list, events and links, with its images, and cancels the gifts pledged
  to it. The relatives who meant to give an archived or deleted wish are told on their link, « Des
  envies ont quitté la liste », so that they do not buy it; an archived wish's gift can be taken
  back. The owner is never told whether anything was given (anti-spoil). API: `DELETE
  /manage/lists/:id`, `DELETE /manage/items/:id`, `GET /manage/lists?archived=true`, `POST
  /public/gifts/gone`, and the same routes in the REST API v1. Migration 0013 adds `deleted_at`.

### Changed

- A free item no longer says « Libre. » (« Free. » in English, read as « gratuit » next to a price):
  its icon says it. The gauge counts « à offrir » (« to give »).
- The givers' initials go above the words on a narrow card, and the price stays on the title's
  first line.
- A wish's « Archiver » and « Remettre dans la liste » buttons become icons, with their words on
  hover and for a screen reader.

### Fixed

- An event's link no longer shows the wishes of an archived list.
- The list page stopped looking again after its first check while items were being completed:
  their title, price and image only showed after a manual reload.

## [0.0.5] - 2026-11-25

### Added

- A reload button (two turning arrows, its name in a tip on hover and focus) on each item, « Recharger », and on a list page, « Recharger les liens », read the links again: a new
  price, a better photo, or what an improved reader now finds (the Amazon photo fixed below also
  reaches the wishes added before). The items show « Lecture du lien… » as for a new one, and a
  « Lien illisible » can be tried again. The owner's words win: a title or a price they typed or
  changed is kept, a photo they sent stays; the page's own values follow the page. No burst
  towards a site: the items of a same site are read 5 seconds apart, and each owner may ask 30
  item reads and 3 list reads per minute. API: `POST /manage/items/:id/refresh` and
  `POST /manage/lists/:id/refresh` (also in the REST API v1). Migration 0010 adds `found_title`
  and `found_price_cents` to the items, filled from their history.
- On a list page, the buttons speak with icons: « Je l'ai reçu » with a tick (it said « Reçu »),
  and an eye for « Aperçu » and three linked dots for « Partager cette liste », their words in a
  tip on hover and on keyboard focus (and their full name for a screen reader). « Se déconnecter »
  stays at the top right of the bar on every width: the links go under it when the bar is narrow,
  and on a phone it is a door with an arrow.

- Wishalia speaks English as well as French: the management app, the public host's home page, the
  guests' page, the e-mails and the name of a first list. Each page follows the browser's
  language; « Réglages » › « Langue » sets one for the account, on every device (`auto` by
  default), and the public pages and the sign-in page have a button for the other language, kept
  on the device (`wishalia.locale`). Dates and amounts are written in the reader's format, in
  euros as before. `DEFAULT_LOCALE` (chart: `config.defaultLocale`, `fr` by default) is the
  language for a browser that asks for neither. API: `locale` in `GET`/`PATCH /manage/me`;
  migration 0011 adds `locale` to the users. The words live in the new `@wishalia/i18n` package,
  and a test of the CI checks that each language has every word ([Languages](docs/i18n.md), with
  how to add one).

### Fixed

- The image of an Amazon page is the product's photo: the worker took the first pictures of the
  page, which on Amazon are banners and ads. It now reads the photo shown big, in its largest size,
  then the other photos of the gallery, only Amazon's product photos and each photo once.

## [0.0.4] - 2026-11-25

### Added

- « Importer une liste » (`/importer`, linked from the home page) brings wishes kept elsewhere: a
  Wishlistr list from its public address, a CSV or JSON file (exports of other services, a
  spreadsheet, columns named in French, English, German or Spanish) or a text pasted with one wish
  per line. The page shows what it found before anything is added; the person keeps what they want
  and picks a new or existing list. Titles, links, notes, prices in euros and quantities come along;
  links already in the list are not added twice, and the worker completes the rest from the links.
  API: `POST /manage/imports/preview` and `POST /manage/imports`. Chart: the management app's form
  limit is `3M` when images are off (it was the 512 KB default).
- An item waiting for its link to be read shows it at a glance: a turning icon with « Lecture du
  lien… » and, with images on, an empty frame where its image will go (both still for those who ask
  for less motion). The
  list page keeps looking for 10 minutes instead of one; « Lien illisible » marks a link that could
  not be read.
- « Retirer votre image » on the « Image » page erases the image the owner sent: the item goes back to
  the page's image, and Wishalia reads the link again for fresh ones
  (`DELETE /manage/items/:id/image/upload`, also in the REST API v1).
- The worker removes, every 6 hours, the image files no image names any more (a write cut halfway,
  a removal that failed, a file left half written), in the volume or the bucket, once they are a
  day old. The images people see or can choose are never touched. Chart:
  `images.cleanup.intervalHours` (`0`: off) and `images.cleanup.graceHours`; metrics
  `wishalia_image_cleanup_*`.

### Fixed

- The price of an Amazon page (amazon.fr and the other countries) is read: Amazon writes no JSON-LD
  and no price tag, so the worker reads the price to pay shown in the page (never the struck-out
  « Prix conseillé »), then the hidden fields of the cart and the variants' data. The microdata
  `itemprop="price"` of other shops is read too. A wall against robots (Amazon's CAPTCHA, a Robot
  Check, a Cloudflare or DataDome challenge) is tried again later, then « Lien illisible », instead
  of being read as the product.

## [0.0.3] - 2026-11-25

### Fixed

- The chart's Garage restarted every half hour or so on a slow volume (NFS): its liveness probe
  asked `/health`, which reads the metadata database, and gave up after one second. Liveness now
  checks the S3 port; `/health` decides readiness only, with 10 seconds to answer. PostgreSQL's
  probes get 5 seconds too.
- The Garage console ignored the chart's `affinity`: it now follows it, like every other pod.
- The Garage console starts with OIDC on: the chart now gives it scopes, `openid`, `profile` and
  `email` by default (`images.garage.ui.oidc.scopes`); garage-ui stopped with « oidc scopes are
  required ». `GARAGE_UI_AUTH_OIDC_SCOPES` in `images.garage.ui.env` still wins.

## [0.0.2] - 2026-11-25

### Added

- An optional web console for the chart's Garage, [Garage UI](https://github.com/Noooste/garage-ui)
  (`images.garage.ui.enabled`, off by default): browse the images in the bucket, its key and the
  node. Sign-in with your OIDC provider (who may sign in is set in
  `images.garage.ui.env`), or with Garage's admin token; its own host on the ingress,
  or none (port-forward). Garage then takes an administration token (`GARAGE_ADMIN_TOKEN`), which
  only the console may use (NetworkPolicy). See [Images](docs/images.md#its-console-garage-ui).
- A home page on the public host (`hosts.public`): a welcome, « Vous avez reçu un lien ? » to open
  or paste a link, « Se connecter » (or « Mes listes » once signed in) to the management app, and
  « Trouver une liste publique », a search by first name or list name, without case or accents.
  See [Public view](docs/public-view.md#the-home-page).
- Each list is « Privée » (the default: seen only through a share link) or « Publique », in its
  settings. A public list is found by the home page and gets an open link anyone may take part
  through, without seeing who else gives, at 5 gifts a minute per address at most. Turning it
  private cuts that address at once. API: `visibility` and `openUrl` on the lists (`/manage`, REST
  API v1), `GET /public/home`, `open` in `GET /public/view`; migration `0009_public_lists`.

## [0.0.1] - 2026-11-24

The first release: images `ghcr.io/arcanexus/wishalia-{api,worker,web-app,web-public}:0.0.1` and
the chart `oci://ghcr.io/arcanexus/charts/wishalia` 0.0.1.

### Added

- The chart can give its volumes to their pods' users, for volume drivers that do not apply
  `fsGroup`, such as NFS through csi-driver-nfs (`volumePermissions.enabled`, off by default): an
  init container, root with the `CHOWN` capability only, gives the root folder of the PostgreSQL,
  image and Garage volumes to the pod's user, and changes nothing when it is already theirs.
- [Authentication](docs/authentication.md) shows how to set up Authentik as the owners' OIDC
  provider, in its interface or with a blueprint.
- The management app installs on a phone, a tablet or a computer (Progressive Web App): a manifest
  (`/manifest.webmanifest`, named after `APP_NAME`), icons (192, 512, maskable, Apple touch), a
  status bar colour that follows the theme and mode, and a service worker that keeps only the app's
  code and icons, never a private page, with a « Pas de connexion » page when offline.
- Web Share Target: on Android, « Partager » then « Wishalia » from any app opens « Ajouter une
  envie » (`/ajouter`) with the shared link and words in the field, a choice of list, and one button
  to add. The page never adds on its own. A shared link survives the sign-in page.
- iOS Shortcut, documented step by step ([Install the app](docs/install-app.md)): through the add
  page, or in the background with a REST API v1 token.
- « Réglages » shows how to install the app on the device in hand, an « Installer Wishalia » button
  where the browser offers one, and the address for the iPhone Shortcut.
- The chart can deploy the images' S3 bucket itself: [Garage](https://garagehq.deuxfleurs.fr), one
  node, with its volume (or an existing claim), inside the cluster only (`images.garage.enabled`,
  off by default; the images stay on a volume by default). Garage makes the bucket and its key from
  `existingSecret` at its first start. MinIO is not offered: its community edition is no longer
  maintained.
- The Helm chart deploys its own PostgreSQL when you have none (`postgresql.enabled`, the default):
  the official image as a StatefulSet with its volume (or an existing claim), a password made once and kept, a
  NetworkPolicy, and `DATABASE_URL` given to the API and the worker. With your own PostgreSQL, set
  `postgresql.enabled=false` and give its URL in `externalDatabase.existingSecret` (any key) or in
  `existingSecret`. The migrations wait for the database to start, and take a lock so that several
  API pods never apply them at once.

### Changed

- Items no longer carry `imageKey` (always empty until now) in the APIs, REST v1 included: they carry
  `image` (signed thumbnail paths, or `null`) and `imageCrop`.
- docker compose pins imgproxy (v4.0.25) and signs its paths with local keys, as in production.

- The product is named **Wishalia**, and the code name `wishlist` is gone: default `APP_NAME` and
  chart `config.appName`, packages (`@wishalia/*`), images (`ghcr.io/arcanexus/wishalia-*`, no longer
  derived from the repository name), the chart (`charts/wishalia`), cookies (`wishalia.*`), metrics
  (`wishalia_*`), the development database and bucket, README, website, documentation, and a new
  logo (five relatives in a circle around a gift). Nothing was deployed yet, so nothing breaks. The
  links point to `Arcanexus/wishalia`, the repository's new name.

### Fixed

- After a move within an app, the page title could show in a corner: SvelteKit's route announcer
  hides itself with a `style` attribute that the CSP blocks. The shared styles now hide it.
- The words guests leave for the owner (« À lire après l'occasion ») never reached them: once the
  secret is lifted, the event page shows each one under the gift it goes with.
- The gifts made without an event never showed who gave them: the list's page now shows who gave
  what, and their words, once the item is received or the list's secret lifted.
- The REST API v1 gave who gave what, with amounts, in an item's history once a secret was lifted,
  against its rule of never giving contribution data. Sealed entries now stay out of v1 for good;
  the management app still shows them after the secret is lifted.
- Both frontends' root element used a `style` attribute that their CSP (`style-src 'self'`)
  blocked: it is a class now.
- The sign-out and light/dark buttons were refused by the CSRF check in real browsers: with
  `Referrer-Policy: no-referrer`, a plain form sends `Origin: null`. The two frontends now send
  `same-origin`, which still never gives a share link token to another site.
- The OIDC callback URL in the documentation is `/auth/callback/oidc`.

### Added

- Items show an image (docs/images.md). The worker takes up to four images from the page of an
  item's link, through the same SSRF guard as the page, keeps only real images read from their bytes
  (JPEG, PNG, WebP, GIF, AVIF, HEIC; never SVG; 120 px to 50 megapixels, 10 MB at most) on a volume
  or in an S3 bucket, and the item shows the first. An « Image » page per item lets the owner choose another,
  send their own photo (made lighter on the device when over 1.5 MB) and frame it in a square, by
  dragging, tapping, the arrow keys or a slider. imgproxy makes the thumbnails from signed paths
  only; the two frontends serve them under `/img/` on their own host, so the CSP keeps
  `img-src 'self'` and imgproxy and the files stay inside the cluster. The images show on the
  owner's lists, in the preview and in the family's view. New table `wish_images`, items get
  `image_id` and `image_crop`; open items with a link are read once more for their images. New
  routes `GET /manage/items/:id/images`, `PUT` and `PATCH /manage/items/:id/image` (also in the REST
  API v1), `image_changed` history entries, `features.images` in `/manage/me`, and the package
  `@wishalia/storage`. The files live where you choose (`IMAGE_STORAGE`, chart `images.storage`):
  on a volume (`volume`, the default: a PersistentVolumeClaim created by the chart and kept on
  uninstall, or `images.persistence.existingClaim`; imgproxy mounts it read-only, and a
  `ReadWriteOnce` volume keeps the API, the worker and imgproxy on one node), or in an S3 bucket
  (`s3`, MinIO). Chart: `images.*` deploys imgproxy (internal, NetworkPolicy to the two frontends)
  and sets `BODY_SIZE_LIMIT` on the management app.

- Items added with a link complete themselves: the worker reads the page (JSON-LD `Product`, then
  Open Graph, then `<title>`) and fills the title, while it is still the site's name, and an empty
  price. It never reaches an internal address (checked after DNS and at each redirect), stops at
  10 s and 3 MB, tries 3 times, and writes an `enriched` history entry. The list page shows the
  items being completed. The queue is a column in PostgreSQL (`enrichment`, migration `0007`), and
  the worker now needs `DATABASE_URL`. New metrics `wishalia_enrichment_*`.
- Reordering a list's items: a handle to drag with a mouse or a finger, and « Monter » / « Descendre »
  arrows for one tap, the keyboard or without JavaScript; the new place is announced. The API takes
  the whole new order at once (`PUT /manage/lists/:id/order`), or nothing when the list changed.
- « Aperçu » on a list page: the list as relatives see it, with made-up gifts plainly marked as
  examples, built without reading any real contribution. The guests' item card and drawings moved
  to `@wishalia/ui` so that both apps draw them the same way.
- Public view of the share links (`/s/<token>`): the list or the event, whose wishes they are, each
  item with its price, notes, link and where it stands (free, reserved by whom, copies left, the
  pool's progress, given at every occasion, received), what is still to give first. The owner on
  their own link is warned and sees no funding at all. An unknown, revoked or expired link gives
  one same page. Same title and preview for every link, `noindex`, never cached; light/dark button.
  See [Public view](docs/public-view.md).
- A list's settings in the management app: its name, a theme forced on everyone (or none), when the
  secret of the gifts made without an event lifts, lifting it, and archiving the list, the last two
  behind a box to tick. See [Management app](docs/management-app.md#a-lists-settings).
- Editing an item in the management app, in place: its name, its kind (a gift, possibly given at
  every occasion; several copies; a pool with an optional target), its price, its list, its link
  and its notes. Works without JavaScript. See
  [Management app](docs/management-app.md#editing-an-item).
- The public view draws where things stand: a pool's bar split by event, with a mark at the target
  and the overshoot hatched past it (« objectif atteint, 60 € en excédent »); one box per copy;
  the givers' initials; « Presque complet » from 80 %; and, at the top, where the event or the
  list stands (« 2 complets, 1 en cours, 0 libre »). See [Public view](docs/public-view.md).
- Contributions folded for a visitor nobody knows on the public view (no account, nothing given
  from the device): states, progress, names and the give buttons stay out of the page until
  « Je ne suis pas Léa », remembered for the link on the device. See
  [Public view](docs/public-view.md#a-visitor-nobody-knows).
- Giving from the public view: reserve a gift or some copies, chip in to a pool, with a word for the
  owner and the choice to stay discreet; on a list link, the event the gift is for. The person sees
  their gifts and withdraws them; without an account, the withdraw key stays in an HttpOnly cookie
  scoped to the link, and their first name is remembered. Works without JavaScript.
  See [Public view](docs/public-view.md#giving).
- `@wishalia/ui`: the design tokens, fonts, logo and light/dark button, shared by the two frontends.

- Passkeys in the management app: « Se connecter avec une clé d'accès » and the passkeys offered in
  the e-mail field's suggestions on `/connexion`; « Clés d'accès » in the settings to add, rename and
  delete them. Passkeys are discoverable (no email to type), and adding one needs a sign-in of less
  than a day. The API tests run the real WebAuthn ceremonies with a software authenticator.
- Management app, settings (`/reglages`): the name, the theme and light or dark, stored with the
  account and followed by the header button and the device's cookies; the API tokens (made, shown
  once, revoked) when the REST API v1 is on. The header gets « Réglages ».
- `GET /manage/me` gives the person's `theme` and `mode`; `PATCH /manage/me` changes them and the
  display name. Migration `0006_user_display_settings`.
- Management app, sharing (`/partage`): one link per guest or group for a list or an event, with
  an optional end date, its address shown once with « Copier le lien » and « Envoyer… », the
  device marked as the owner's, the active links and their revocation behind a confirmation.
  « Partager cette liste » and « Partager cet événement » lead there. The header gets
  « Partager », and its mode button an icon.
- Management app, events (`/evenements`): the events, upcoming and past, their creation and
  settings, the items an event selects (added from every list in one tap, or removed), and lifting
  the secret once allowed, behind a confirmation. Then each item shows who gave what for the event.
  A Christmas event turns the automatic theme to Christmas. The header gets « Mes listes » and
  « Événements ».
- Management app, first screens (see [Management app](docs/management-app.md)): signing in by
  e-mail link or single sign-on (`/connexion`, button named by `auth.oidc.name` / `OIDC_NAME`),
  signing out, the lists with their number of wishes, list creation, the quick add (shown at once,
  undo offered when the link is already there) and a list page where items are marked received,
  archived or put back. Neutral and Christmas themes in light and dark, the header button that
  switches the mode (kept in the `wishalia.mode` cookie, applied server side without a flash), the
  theme a list forces, Nunito and Inter. Every page passes axe (WCAG 2.2 AA) in both modes, on a
  phone and a computer, and works without JavaScript.
- `@wishalia/domain`: `resolveTheme`, `parseThemeChoice`, `parseModeChoice`, `nextMode`.
- Chart: `auth.oidc.name`; `docs/chart-values.md` now lists the `auth.*` values.
- REST API v1 (`/v1/*`) on its own host (`hosts.api`, off by default), for scripts and home
  automation: personal access tokens made, listed and revoked in `/manage/api-tokens` (hash stored,
  1 to 365 days, read-only option), the rights of `/manage` without any contribution data, a rate
  limit per token (`API_RATE_LIMIT`) and an OpenAPI 3.1 description at `/v1/openapi.json`. The
  ingress forwards `/v1` only on that host, and the API refuses its other routes there. See
  [REST API v1](docs/rest-api.md).
- Migration `0005_api_tokens`.

- Share links per guest or group, for a list or an event: created, listed and revoked in
  `/manage/share-links`, with the device marker that recognises the owner without a session.
- Public view API (`/public/*`): the view of a share link, contributions and reservations (pools
  with overshoot, unique and quantity items, repeatable items per event) and their withdrawal by
  their author. A contribution may have no event, since a list is not always tied to one; its
  secret then lifts as the list says (`revealMode`): when the owner marks the item received
  (default), or when they lift the secret of the list (`POST /manage/lists/:id/reveal`). The owner gets no funding until every
  secret of an item is lifted, and cannot contribute. See [Public view API](docs/public-api.md).
- `@wishalia/domain`: `isShareLinkActive`, `refuseContribution`, and `canSeeContributions` now takes
  the secret of an event or of an item (`SecretState`).
- Migration `0004_contributions_without_event`: the event of a contribution becomes optional, the
  list's `reveal_mode` and `revealed_at`, and the hash of the key a guest without an account uses
  to withdraw their contribution.
- Social preview image (`docs/images/social-preview.png`, 1280 × 640) for the repository and the
  website's Open Graph tags, and a dark logo variant used by the README and the website in dark
  mode.
- Management API (`/manage/*`): lists, items (quick add from a URL or text, in-place edits, moves,
  received and archived), events (item selection, reveal of the secret) and the history of each
  item. Everything is scoped to its owner (404 otherwise) and never returns contribution data.
  See [Management API](docs/api.md).
- A list can force its theme (`neutral` or `christmas`) on everyone who opens it (migration
  `0003_list_theme`).
- `@wishalia/domain`: `parseQuickAdd`, `cleanUrl` (tracking parameters removed, only http(s)
  links) and `diffWish` for the history.
- JSON errors on every route, without internal details in a 500.
- [Branding](docs/branding.md): logo, neutral and Christmas palettes in light and dark, fonts, and
  the theme settings each person will get (theme and light/dark mode) and the theme a list can
  force.

- Sign-in with Better Auth in the API: OIDC for the owners, passkeys and magic links for the
  family, no password. Invitation only (`OWNER_EMAILS`). A 30-day `__Secure-` session shared by the
  two hosts (`COOKIE_DOMAIN`). See [Authentication](docs/authentication.md).
- The management app proxies `/auth/*` to the internal API; `/manage/*` needs a session
  (`/manage/me`).
- Migration `0002_auth`: sessions, accounts, verifications and passkeys tables.
- `/readyz` of the API checks the database.
- Chart: `auth.*` values (owners, cookie domain, OIDC, magic link sender), with a guard on the
  cookie domain.
- Prometheus metrics on every component: `/metrics` on its own port (`METRICS_PORT`, 9464 in the
  chart), request durations per route pattern, Node.js process metrics, `wishalia_build_info`. No
  metric describes contributions. See [Monitoring](docs/monitoring.md).
- Chart: `metrics.*` values, a `metrics` port on every Service (the worker gets a Service for it),
  NetworkPolicy rules for the scrape (`metrics.allowFrom`) and an optional ServiceMonitor.
- Data model: nine tables (users, lists, items, series, events, event items, contributions, share
  links, item history) and the first migration. See [Data model](docs/data-model.md).
- `item_events` is append-only, enforced by a database trigger.
- Share links store only the SHA-256 hash of their token.
- `@wishalia/domain`: funding rules (totals, remaining, overshoot, segments per event, item states)
  and the anti-spoil rule (`resolveViewer`, `canSeeContributions`, `canSeeHistoryEntry`).
- Demo data (`db:seed`) and the migration entry point of the API image (`node dist/migrate.js`).

- Monorepo (pnpm + Turborepo, TypeScript strict) with four components: the API (Fastify, separate
  `/manage` and `/public` scopes), the worker, the management app and the public view (SvelteKit).
- `@wishalia/domain`: amounts in cents, parsing of amounts typed the French way (`12,50`).
- Security headers on every response: strict CSP, `no-referrer`, no framing.
- Generic page titles and link previews on the public view: they never reflect the state of a list.
- One Dockerfile for the four images (`--build-arg APP=...`), non-root and without npm at run time.
- Helm chart `charts/wishalia`: four Deployments, two hosts, internal API behind a NetworkPolicy,
  hardened pods, migration Job. See [Chart values](docs/chart-values.md).
- CI: format, lint, typecheck, tests with a coverage threshold and badge, chart lint, multi-arch
  images scanned by Trivy, CodeQL, dependency audit, Dependabot, release, chart publication.
- Documentation in `docs/`, published to the wiki, and the product website on GitHub Pages.
