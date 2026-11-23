import { nextMode } from "@wishalia/domain";

import type { LayoutServerLoad } from "./$types";

export const load: LayoutServerLoad = ({ locals }) => ({
  appName: process.env.APP_NAME ?? "Wishalia",
  mode: locals.mode,
  nextMode: nextMode(locals.mode),
});
