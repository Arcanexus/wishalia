import { formatters, type Formatters, type Locale } from "@wishalia/i18n";
import { getContext, setContext } from "svelte";

/**
 * The page's language, for every component under the root layout (docs/i18n.md). The server
 * resolves it (the person's choice, then their browser's, then DEFAULT_LOCALE) and the root layout
 * provides it; a component reads it with useI18n() and picks its words from a catalog.
 */
export interface I18n {
  readonly locale: Locale;
  readonly fmt: Formatters;
}

const KEY = Symbol.for("wishalia.i18n");

/** In the root layout: the locale comes from its data, so a change of language is seen at once. */
export function provideI18n(locale: () => Locale): I18n {
  const i18n: I18n = {
    get locale() {
      return locale();
    },
    get fmt() {
      return formatters(locale());
    },
  };
  setContext(KEY, i18n);
  return i18n;
}

export function useI18n(): I18n {
  const i18n = getContext<I18n | undefined>(KEY);
  if (!i18n) throw new Error("useI18n() needs provideI18n() in the root layout");
  return i18n;
}
