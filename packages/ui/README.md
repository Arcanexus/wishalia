# @wishalia/ui

What the management app and the public view share, so that they look the same:

- `@wishalia/ui/styles.css`: the design tokens of the two themes (neutral, Christmas) in light and
  dark, the fonts (Nunito, Inter) and the base styles (buttons, fields, cards, focus, skip link);
- `@wishalia/ui/Logo.svelte`: the logo, in the theme's colours;
- `@wishalia/ui/ModeButton.svelte`: the light/dark button of the headers, a plain form to the
  app's `/preferences`;
- `@wishalia/ui/LanguageButtons.svelte`: a button per other language, the same way;
- `@wishalia/ui/i18n.ts`: `provideI18n` (root layout) and `useI18n` (components), the page's
  language and its formatters.
- `@wishalia/ui/public/*`: what the guests' page shows, for both the guests and the owner's « Aperçu »:
  the item card (`ItemCard.svelte`), the drawings (`PoolBar`, `Copies`, `Givers`, `EventGauge`),
  the words (`view.ts`), the view's types (`types.ts`) and the preview's made-up gifts
  (`sample.ts`).

No build: the apps' SvelteKit build bundles it. See [Branding](../../docs/branding.md).
