# Branding

The product is called **Wishalia**, and so is everything technical: repository, packages
(`@wishalia/*`), images, Helm chart, cookies (`wishalia.*`) and metrics (`wishalia_`). The name shown
to people comes from `APP_NAME` (chart: `config.appName`), with `Wishalia` as the default.

## Logo

![Wishalia logo](images/logo.svg)

Five relatives in a circle around a gift: the family gathers around the present. The source is
[`images/logo.svg`](images/logo.svg) (96 × 96 viewBox).

- The five heads sit on a thin ring that joins them. Keep the ring: at small sizes (favicon, app
  header) it may be dropped, never the heads or the gift.
- The gift has a lid, a box, a ribbon and a two-loop bow.
- Variants: app icon (white heads on the action colour), single colour (one ink colour, white
  ribbon), and the Christmas variant where the ring becomes a holly wreath with berries.
- Leave at least a quarter of the logo's width of free space around it.
- App icons, for the installed app ([Install the app](install-app.md)): the logo on the neutral
  background `#F6F5F2`, in `apps/web-app/static/icons/` (192 and 512 px with rounded corners, a
  maskable 512 px one with the logo inside the central 80 % circle, and a square 180 px
  `apple-touch-icon.png` that iOS rounds itself).
- On a dark background, use [`images/logo-dark.svg`](images/logo-dark.svg) (dark neutral palette).
  The README and the website switch between the two with `prefers-color-scheme`.

## Social preview

![Wishalia social preview](images/social-preview.png)

The image shown when a link to the repository or the website is shared (1280 × 640, GitHub's
recommended size): logo, wordmark and tagline on the light neutral background. The source is
[`images/social-preview.svg`](images/social-preview.svg); the PNG is rendered from it with Nunito
and Inter. The website points to it in its Open Graph tags. For the repository, it is uploaded by
hand in **Settings › General › Social preview** (GitHub has no API for it).

## List icons

The sixteen icons a list can show ([Pictures of the lists](list-pictures.md)) are line drawings on a
24 px grid, coloured as the logo is: lines in `--logo-heads`, a detail in `--logo-gift` and, here
and there, `--logo-ribbon`. They sit in a rounded square on the page's background, so they follow
each theme and mode without a variant. Drawings: `packages/ui/src/list-icons.ts`.

## Icons

The buttons of the apps are icons whenever an icon says the thing clearly, from one set
(`packages/ui/src/icons.ts`, drawn by `@wishalia/ui/Icon.svelte`): plain strokes on a 24 × 24 grid,
in the colour of the text, so that they follow every theme and mode. A pencil edits, a heart marks
received, a box archives, a bin deletes (in the danger colour), two turning arrows reload, an eye
previews, three linked dots share, a cog opens settings, a cross closes. Books on a shelf mark a
series, lines with an arrow put wishes into it, an arrow leaving its box takes a volume out, four
apart squares undo it. An icon alone always
carries its words as its accessible name and in a tip shown on hover and keyboard focus, which
Escape hides (WCAG 1.4.13). A state is shown by an icon and a colour, never by colour alone.

## Header

The bar has the logo and the app's places on the left, and round icons at the top right: the
**display menu** (mode, theme, language), then the **account menu** (the first letter of the
person's name: their settings and signing out) or, signed out, an arrow going in to sign in. See
[Management app](management-app.md#the-header).

## Themes

Two themes, each in light and dark. **Neutral** is the default, all year round and for every event
(birthday, birth…). **Christmas** replaces it for a list tied to a Christmas event, or in December.
The app follows the device setting (`prefers-color-scheme`); the display menu of the header forces
light or dark, or a theme, and the choice is remembered.

### Theme settings

Each person manages their themes in the settings of the apps (management app and public view):

- **Theme**: `Automatic` (default: Christmas for a Christmas list or in December, neutral
  otherwise), `Neutral` or `Christmas`.
- **Mode**: `Same as my device` (default), `Light` or `Dark`. The display menu at the top right of
  the header (half a disc, a sun or a moon) is a shortcut to the mode, the theme and the language.

The owner of a list can also **force a theme for that list** in the list's settings: `None`
(default, each person's choice applies), `Neutral` or `Christmas`. A forced theme applies to
everyone who opens the list, owner and guests, over their own theme setting. The mode always stays
personal: a forced theme is shown in light or dark according to each person's mode, so nobody loses
the contrast they need.

Order, from strongest: the list's forced theme, then the person's theme, then `Automatic`. A
person's settings are stored with their account when there is one, and on the device otherwise
(guests on their nominative link).

Every text colour below meets WCAG 2.2 AA (4.5:1) on the background it is used on. Decorative
colours (logo ring, ribbon, progress bars) are never used for text.

### Neutral

| Role               | Light                 | Dark                  | Contrast (light / dark)    |
| ------------------ | --------------------- | --------------------- | -------------------------- |
| Background         | `#F6F5F2`             | `#15181C`             |                            |
| Surface (cards)    | `#FFFFFF`             | `#1E232A`             |                            |
| Text               | `#1E2329`             | `#EEF0F2`             | 15:1 / 16:1                |
| Secondary text     | `#5C6570`             | `#A3ACB7`             | 5.5:1 / 6.8:1              |
| Action (buttons)   | `#33475B`             | `#4A6A8A`             | white on it: 9.6:1 / 5.6:1 |
| Link               | `#33475B`             | `#A9C4E0`             |                            |
| Accent (gift, CTA) | `#9F2A3B`             | `#B23A4B`             | white on it: 7.2:1 / 5.7:1 |
| Progress (pots)    | `#5B7A99`             | `#8FB0D0`             | decorative                 |
| Logo heads         | `#33475B`             | `#A9C4E0`             |                            |
| Logo gift / ribbon | `#9F2A3B` / `#C9B79C` | `#D46A78` / `#D9C9AE` | decorative                 |

### Christmas

| Role               | Light                 | Dark                  | Contrast (light / dark)    |
| ------------------ | --------------------- | --------------------- | -------------------------- |
| Background         | `#FBF7F0`             | `#121815`             |                            |
| Surface (cards)    | `#FFFFFF`             | `#1C2621`             |                            |
| Text               | `#1F2430`             | `#F4F1EA`             | 15:1 / 16:1                |
| Secondary text     | `#5B6170`             | `#A9B5AE`             | 6:1 / 8:1                  |
| Action (buttons)   | `#1E5B3F`             | `#2E7D57`             | white on it: 8.0:1 / 5.0:1 |
| Link               | `#1E5B3F`             | `#8FD3AE`             |                            |
| Accent (gift, CTA) | `#B91C1C`             | `#C53030`             | white on it: 6.5:1 / 5.3:1 |
| Progress (pots)    | `#E0A526`             | `#E8B53A`             | decorative                 |
| Logo heads         | `#1E5B3F`             | `#8FD3AE`             |                            |
| Logo gift / ribbon | `#B91C1C` / `#E0A526` | `#E5484D` / `#F3C969` | decorative                 |

Red and green also differ in lightness, so people with a colour-vision deficiency still tell them
apart.

## Fonts

- Headings and the wordmark: **Nunito** (800 for the wordmark, 700–800 for titles). Rounded and
  friendly, readable at every age.
- Body text and the interface: **Inter** (400–600).
- Both are under the SIL Open Font License. The apps must serve them themselves (no third-party
  font request, in line with the strict CSP).

## Wordmark

`Wish` in the text colour followed by `alia` in the accent colour, set in Nunito 800 with a slight
negative letter spacing (−0.02em). Beside the logo, the wordmark's cap height matches about half the
logo's height.
