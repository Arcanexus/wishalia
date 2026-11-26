import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => ({
  appName: process.env.APP_NAME ?? "Wishalia",
  locale: locals.locale,
  mode: locals.mode,
  themeChoice: locals.themeChoice,
});
