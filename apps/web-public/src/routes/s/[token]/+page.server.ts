import { error } from "@sveltejs/kit";

import { genericMeta } from "#lib/meta.ts";
import { loadView } from "#lib/server/api.ts";
import { sortForGuests } from "#lib/view.ts";

import type { PageServerLoad } from "./$types";

export const load: PageServerLoad = async (event) => {
  const view = await loadView(event, event.params.token);
  // The same page for an unknown, revoked or expired link: nothing tells them apart
  if (!view) error(404, "link_not_found");

  // A list's forced theme wins; a Christmas event, or a list for an open Christmas, turns the
  // automatic theme to Christmas
  event.locals.listTheme = view.list?.theme ?? null;
  event.locals.christmas =
    view.event?.kind === "christmas" || view.events.some((item) => item.kind === "christmas" && item.open);
  // Personal, and it changes with every contribution: never in a cache
  event.setHeaders({ "cache-control": "private, no-store" });

  return {
    // The same title and preview for every link: a preview in a chat gives nothing away
    meta: genericMeta(process.env.APP_NAME ?? "Wishalia"),
    view: { ...view, items: sortForGuests(view.items) },
  };
};
