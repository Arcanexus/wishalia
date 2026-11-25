// See https://svelte.dev/docs/kit/types#app.d.ts
import type { ModeChoice, ThemeChoice, ThemeName } from "@wishalia/domain";
import type { Locale, LocaleChoice } from "@wishalia/i18n";

declare global {
  namespace App {
    interface Locals {
      /** The person's own choices, from their preference cookies. */
      themeChoice: ThemeChoice;
      mode: ModeChoice;
      localeChoice: LocaleChoice;
      /** The language of the page (docs/i18n.md), resolved from the choice and the browser. */
      locale: Locale;
      /** A theme the page's list forces on everyone, set by the list page before rendering. */
      listTheme: ThemeName | null;
      /** The page is about Christmas (a Christmas event): the automatic theme turns Christmas. */
      christmas: boolean;
    }
    interface PageData {
      /** The page's language, from the root layout (or the app's, with the account's choice). */
      locale?: Locale;
    }
    interface Error {
      message: string;
    }
  }
}

export {};
