// See https://svelte.dev/docs/kit/types#app.d.ts
import type { ModeChoice, ThemeChoice, ThemeName } from "@wishalia/domain";

declare global {
  namespace App {
    interface Locals {
      /** The person's own choices, from their preference cookies. */
      themeChoice: ThemeChoice;
      mode: ModeChoice;
      /** A theme the page's list forces on everyone, set by the list page before rendering. */
      listTheme: ThemeName | null;
      /** The page is about Christmas (a Christmas event): the automatic theme turns Christmas. */
      christmas: boolean;
    }
    interface Error {
      message: string;
    }
  }
}

export {};
