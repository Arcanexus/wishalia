# @wishalia/ui

What the management app and the public view share, so that they look the same:

- `@wishalia/ui/styles.css`: the design tokens of the two themes (neutral, Christmas) in light and
  dark, the fonts (Nunito, Inter) and the base styles (buttons, fields, cards, focus, skip link);
- `@wishalia/ui/Logo.svelte`: the logo, in the theme's colours;
- `@wishalia/ui/ModeButton.svelte`: the light/dark button of the headers, a plain form to the
  app's `/preferences`.

No build: the apps' SvelteKit build bundles it. See [Branding](../../docs/branding.md).
