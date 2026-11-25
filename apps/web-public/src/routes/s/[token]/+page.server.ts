import { error, fail } from "@sveltejs/kit";
import { parseAmount } from "@wishalia/domain";

import { genericMeta } from "#lib/meta.ts";
import { isWellFormedToken, loadView, publicFetch } from "#lib/server/api.ts";
import {
  readGifts,
  readGuestName,
  readUnfolded,
  writeGifts,
  writeGuestName,
  writeUnfolded,
} from "#lib/server/gifts.ts";
import type { MyGift, PublicView } from "@wishalia/ui/public/types.ts";
import { sortForGuests } from "@wishalia/ui/public/view.ts";

import type { Actions, PageServerLoad } from "./$types";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The highest pledge the API takes: a typo, not a gift. */
const MAX_AMOUNT_CENTS = 100_000_000;

/** The person's own gifts: those of their account, and those kept on this device. */
function myGifts(view: PublicView, kept: MyGift[]): MyGift[] {
  const fromAccount = view.items.flatMap((item) =>
    (item.funding?.mine ?? []).map((gift) => ({ ...gift, itemId: item.id })),
  );
  const ids = new Set(fromAccount.map((gift) => gift.id));
  const open = new Set(view.items.map((item) => item.id));
  return [...fromAccount, ...kept.filter((gift) => !ids.has(gift.id) && open.has(gift.itemId))];
}

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

  // The withdraw keys stay on the server: the page only learns what was given
  const kept = readGifts(event.cookies).map(({ key: _key, ...gift }) => gift);
  // Nobody known on this device: what others give stays folded until they say they are not the
  // owner. It is left out of the page, not hidden in it, and the order gives nothing away either.
  const folded =
    view.viewer === "guest" &&
    view.me === null &&
    kept.length === 0 &&
    !readUnfolded(event.cookies) &&
    view.items.some((item) => item.funding !== null);
  const items = sortForGuests(folded ? view.items.map((item) => ({ ...item, funding: null })) : view.items);
  return {
    // The same title and preview for every link: a preview in a chat gives nothing away
    meta: genericMeta(process.env.APP_NAME ?? "Wishalia", event.locals.locale),
    view: { ...view, items },
    folded,
    mine: folded ? [] : myGifts(view, kept),
    guestName: readGuestName(event.cookies),
  };
};

/** What the API answers with, as the page's error codes. */
async function codeOf(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error ?? "unavailable";
}

export const actions: Actions = {
  /** « Je ne suis pas … » : what others give shows on this link, on this device. */
  unfold: async (event) => {
    const { token } = event.params;
    if (!isWellFormedToken(token)) error(404, "link_not_found");
    writeUnfolded(event.cookies, token, event.url.protocol === "https:");
    return { unfolded: true };
  },

  /** A reservation or a pledge, through the link: the API checks what is left and the secrets. */
  give: async (event) => {
    const { token } = event.params;
    if (!isWellFormedToken(token)) error(404, "link_not_found");
    const form = await event.request.formData();
    const itemId = String(form.get("itemId") ?? "");
    const eventId = String(form.get("eventId") ?? "");
    const amount = String(form.get("amount") ?? "").trim();
    const unitsText = String(form.get("units") ?? "").trim();
    const guestName = String(form.get("guestName") ?? "").trim();
    const message = String(form.get("message") ?? "").trim();
    const anonymous = form.get("anonymous") === "on";
    const values = { itemId, amount, units: unitsText, guestName, message, anonymous };

    if (!UUID.test(itemId) || (eventId && !UUID.test(eventId))) {
      return fail(400, { give: { ...values, error: "invalid_request" } });
    }
    if (guestName.length > 60 || message.length > 500) {
      return fail(400, { give: { ...values, error: "too_long" } });
    }
    let amountCents: number | undefined;
    if (amount) {
      const parsed = parseAmount(amount);
      if (parsed === null || parsed <= 0 || parsed > MAX_AMOUNT_CENTS) {
        return fail(400, { give: { ...values, error: "amount_required" } });
      }
      amountCents = parsed;
    }
    let units: number | undefined;
    if (unitsText) {
      units = Number(unitsText);
      if (!Number.isInteger(units) || units < 1 || units > 1000) {
        return fail(400, { give: { ...values, error: "units_required" } });
      }
    }

    const response = await publicFetch(event, token, `/public/items/${itemId}/contributions`, {
      method: "POST",
      body: {
        ...(eventId ? { eventId } : {}),
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(units !== undefined ? { units } : {}),
        ...(guestName ? { guestName } : {}),
        ...(message ? { message } : {}),
        anonymous,
      },
    });
    if (response.status === 404 && (await codeOf(response.clone())) === "link_not_found") {
      error(404, "link_not_found");
    }
    if (!response.ok) {
      const code = await codeOf(response);
      // Without an account, the API needs a name
      const named = code === "invalid_request" && !guestName ? "name_required" : code;
      return fail(response.status, { give: { ...values, error: named } });
    }
    const created = (await response.json()) as {
      contribution: {
        id: string;
        itemId: string;
        eventId: string | null;
        amountCents: number | null;
        units: number | null;
      };
      withdrawKey: string;
    };
    const secure = event.url.protocol === "https:";
    const { contribution } = created;
    writeGifts(
      event.cookies,
      token,
      [
        ...readGifts(event.cookies),
        {
          id: contribution.id,
          itemId: contribution.itemId,
          eventId: contribution.eventId,
          amountCents: contribution.amountCents,
          units: contribution.units,
          key: created.withdrawKey,
        },
      ],
      secure,
    );
    if (guestName) writeGuestName(event.cookies, guestName, secure);
    return { given: { itemId } };
  },

  /** Takes a gift back: by its withdraw key on this device, or by the person's account. */
  withdraw: async (event) => {
    const { token } = event.params;
    if (!isWellFormedToken(token)) error(404, "link_not_found");
    const id = String((await event.request.formData()).get("id") ?? "");
    if (!UUID.test(id)) return fail(400, { withdraw: { error: "invalid_request" } });
    const gifts = readGifts(event.cookies);
    const kept = gifts.find((gift) => gift.id === id);
    const response = await publicFetch(event, token, `/public/contributions/${id}`, {
      method: "DELETE",
      ...(kept ? { headers: { "x-withdraw-key": kept.key } } : {}),
    });
    // Withdrawn, or no longer there: either way, this device forgets it
    if (response.status === 204 || (response.status === 404 && kept)) {
      if (kept) {
        writeGifts(
          event.cookies,
          token,
          gifts.filter((gift) => gift.id !== id),
          event.url.protocol === "https:",
        );
      }
      return { withdrawn: { itemId: kept?.itemId ?? null } };
    }
    return fail(response.status, { withdraw: { id, error: await codeOf(response) } });
  },
};
