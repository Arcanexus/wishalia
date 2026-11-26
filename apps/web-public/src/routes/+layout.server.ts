import { helpUrl, shownVersion } from "@wishalia/ui/footer.ts";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => ({
  appName: process.env.APP_NAME ?? "Wishalia",
  locale: locals.locale,
  mode: locals.mode,
  themeChoice: locals.themeChoice,
  // The foot of the pages (docs/user-guide.md): the version that runs, and where help is
  version: shownVersion(process.env.APP_VERSION, __WISHALIA_VERSION__),
  help: helpUrl(locals.locale, process.env.HELP_URL),
});
