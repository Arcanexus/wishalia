# @wishalia/i18n

The languages of Wishalia (French and English) and every word shown to people:

- `@wishalia/i18n`: the languages (`LOCALES`, `LOCALE_NAMES`, `LOCALE_TAGS`), reading a choice or
  an `Accept-Language` header (`parseLocale`, `negotiateLocale`, `resolveLocale`), and
  `formatters(locale)` for dates, amounts in euros and lists of names;
- `@wishalia/i18n/messages/<area>`: the words of an area (`common`, `app`, `public`, `view`,
  `mail`, `api`) in one language, as `<area>Messages(locale)`. French is the source; each other
  language is typed after it.

`src/messages/catalog.test.ts` checks that each language has every word. See
[Languages](../../docs/i18n.md), including how to add one.
