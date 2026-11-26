<script lang="ts">
  import { tick, untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { isLive, liveChanges, type LiveItem } from "@wishalia/domain";
  import Icon from "@wishalia/ui/Icon.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import { followLive, holding } from "@wishalia/ui/live.ts";

  import ConfirmDelete from "#lib/ConfirmDelete.svelte";
  import Gifts from "#lib/Gifts.svelte";
  import ItemEditor from "#lib/ItemEditor.svelte";
  import ItemThumb from "#lib/ItemThumb.svelte";
  import ListPictureLink from "#lib/ListPictureLink.svelte";
  import ListSettings from "#lib/ListSettings.svelte";
  import QuickAdd from "#lib/QuickAdd.svelte";
  import StageIcon from "@wishalia/ui/StageIcon.svelte";
  import IconButton from "#lib/IconButton.svelte";
  import { dropIndex, moveId } from "#lib/reorder.ts";
  import { itemStage } from "#lib/stage.ts";
  import type { Item } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).list);
  const removal = $derived(appMessages(i18n.locale).removal);

  const open = $derived(data.items.filter((item) => item.status === "open"));
  const images = $derived(data.me.features?.images ?? false);
  const byId = $derived(new Map(open.map((item) => [item.id, item])));

  // While the worker completes items from their links, the page follows it live
  // (docs/live-updates.md): a few-byte question every 2 seconds, then every 10, and the list loads
  // again only when something changed. Never with the tab hidden, never without a reason.
  const completing = $derived(open.some((item) => isLive(stage(item))));
  // Asking to read links again starts the following over
  let refreshes = $state(0);
  $effect(() => {
    void refreshes;
    if (!completing) return;
    const follower = untrack(() =>
      followLive({
        url: resolve("/(app)/listes/[id]/suivi", { id: data.list.id }),
        reload: () => invalidate("wishalia:list"),
        // Never under a dragged item or a wish being edited
        canReload: () => !order && !dragging && !holding(),
      }),
    );
    return () => follower.stop();
  });

  // What a screen reader hears as the items fill in: one polite line per item and step
  let heard = $state("");
  let before: LiveItem[] = [];
  $effect(() => {
    const now = open.map(liveItem);
    const changes = liveChanges(before, now);
    before = now;
    if (changes.length > 0) heard = changes.map((change) => m.live[change.kind](change.title)).join(" ");
  });

  // The order on screen while an item moves, before the server confirms it (optimistic)
  let order = $state<string[] | null>(null);
  let dragging = $state<string | null>(null);
  let moved = $state("");
  let list = $state<HTMLUListElement>();
  let orderForm = $state<HTMLFormElement>();
  const shown = $derived(order ? order.flatMap((id) => byId.get(id) ?? []) : open);

  const place = (id: string, ids: string[]) => {
    const item = byId.get(id);
    moved = item ? m.place(item.title, ids.indexOf(id) + 1, ids.length) : "";
  };

  /** After the server answered: its order is the truth, also when it refused (the list changed). */
  const settle =
    (focus?: { id: string; direction: string }) =>
    async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      order = null;
      if (!focus) return;
      // A moved node loses the focus, and the arrow is gone at the top or the bottom: keep the
      // keyboard on the item, on the arrow that still goes somewhere
      await tick();
      const li = list?.querySelector(`li[data-id="${focus.id}"]`);
      const same = li?.querySelector<HTMLButtonElement>(`button[value="${focus.direction}"]`);
      const other = li?.querySelector<HTMLButtonElement>(
        `button[name="direction"]:not([value="${focus.direction}"])`,
      );
      (same && !same.disabled ? same : other)?.focus();
    };

  /** Drag by the handle, with a mouse, a pen or a finger; the arrows do the same in one tap. */
  function drag(event: PointerEvent, id: string) {
    if (event.button !== 0 || !list) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const before = shown.map((item) => item.id);
    order = before;
    dragging = id;
    const follow = (move: PointerEvent) => {
      const others = [...(list?.querySelectorAll<HTMLElement>(":scope > li") ?? [])].filter(
        (li) => li.dataset.id !== id,
      );
      const middles = others.map((li) => {
        const box = li.getBoundingClientRect();
        return box.top + box.height / 2;
      });
      const next = moveId(order ?? before, id, dropIndex(middles, move.clientY));
      if (next.join() !== (order ?? before).join()) order = next;
      // Near the edges, the page scrolls along
      if (move.clientY < 64) window.scrollBy(0, -16);
      else if (move.clientY > window.innerHeight - 64) window.scrollBy(0, 16);
    };
    const drop = async (end: PointerEvent) => {
      handle.removeEventListener("pointermove", follow);
      handle.removeEventListener("pointerup", drop);
      handle.removeEventListener("pointercancel", drop);
      dragging = null;
      if (end.type === "pointercancel" || !order || order.join() === before.join()) {
        order = null;
        return;
      }
      place(id, order);
      await tick();
      orderForm?.requestSubmit();
    };
    handle.addEventListener("pointermove", follow);
    handle.addEventListener("pointerup", drop);
    handle.addEventListener("pointercancel", drop);
  }
  const closed = $derived(data.items.filter((item) => item.status !== "open"));

  /** After a « Recharger »: the page shows « Lecture du lien… » and looks again, from the start. */
  const reread =
    () =>
    async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      refreshes += 1;
    };
  const linked = $derived(open.some((item) => webLink(item) !== null));
  const refreshError = $derived(
    form?.refresh && "error" in form.refresh
      ? form.refresh.error === "rate_limited"
        ? m.refreshRateLimited
        : m.refreshFailed
      : null,
  );

  /** Only web links become links: never a javascript: or data: address from an old item. */
  const webLink = (item: Item) => (item.url && /^https?:\/\//i.test(item.url) ? item.url : null);
  const kindLine = (item: Item) =>
    item.kind === "pool"
      ? item.targetCents
        ? m.poolTarget(i18n.fmt.money(item.targetCents))
        : m.pool
      : item.kind === "quantity"
        ? m.copies(item.quantity ?? 1)
        : item.repeatable
          ? m.everyOccasion
          : null;
  const failedEdit = (item: Item) =>
    form?.edit && "error" in form.edit && form.edit.itemId === item.id
      ? { error: form.edit.error, values: form.edit.values }
      : null;
  const stage = itemStage;
  const liveItem = (item: Item): LiveItem => ({
    id: item.id,
    title: item.title,
    priceCents: item.priceCents,
    stage: stage(item),
    image: item.image?.small ?? null,
  });
  // The item being edited and the list's settings, open under the pencil and the cog. Their links
  // (?modifier=…, ?reglages) open them before the page's JavaScript has loaded, or after a refusal
  let editing = $state<string | null>(untrack(() => page.url.searchParams.get("modifier")));
  let settingsOpen = $state(untrack(() => page.url.searchParams.has("reglages")));
  $effect(() => {
    if (form?.edit && "error" in form.edit) editing = form.edit.itemId;
  });
  const toggleEdit = async (id: string) => {
    editing = editing === id ? null : id;
    if (editing) {
      await tick();
      document.getElementById(`edit-${id}-titre`)?.focus();
    }
  };
  const host = (url: string) => URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
</script>

<svelte:head>
  <title>{data.list.name} · {data.appName}</title>
</svelte:head>

<p class="back">
  <a href={resolve("/(app)")}><Icon name="chevronLeft" size="1.2rem" />{m.back}</a>
</p>
<div class="heading">
  <!-- The list's own picture in front of its name, a pencil over it to change it -->
  <div class="title">
    <ListPictureLink
      picture={data.list}
      href={resolve("/(app)/listes/[id]/icone", { id: data.list.id })}
      label={appMessages(i18n.locale).listPicture.change.label(data.list.name)}
      tip={appMessages(i18n.locale).listPicture.change.tip}
    />
    <h1>{data.list.name}</h1>
  </div>
  <div class="actions">
    {#if linked}
      <form method="POST" action="?/refreshAll" use:enhance={reread}>
        <IconButton icon="reload" label={m.refreshAll.label} tip={m.refreshAll.tip} />
      </form>
    {/if}
    <IconButton
      icon="eye"
      label={m.preview.label}
      tip={m.preview.tip}
      href={resolve("/(app)/listes/[id]/apercu", { id: data.list.id })}
    />
    <IconButton
      icon="share"
      label={m.share.label}
      tip={m.share.tip}
      href="{resolve('/(app)/partage')}?liste={data.list.id}"
    />
    <IconButton
      icon="settings"
      label={m.settings.label}
      tip={m.settings.tip}
      href="?reglages"
      expanded={settingsOpen}
      controls="reglages-liste"
      onclick={() => (settingsOpen = !settingsOpen)}
    />
  </div>
</div>

{#if page.url.searchParams.has("importees")}
  {@const added = Number(page.url.searchParams.get("importees")) || 0}
  {@const twice = Number(page.url.searchParams.get("doublons")) || 0}
  <p class="notice" role="status">{m.imported(added, twice)}</p>
{/if}

{#if refreshError}
  <p class="notice error" role="alert">{refreshError}</p>
{:else if form?.refresh && "queued" in form.refresh}
  {@const queued = form.refresh.queued}
  <p class="notice" role="status">
    {m.refreshQueued(queued)}
    {m.refreshKeeps}
  </p>
{/if}

<ListSettings list={data.list} {form} bind:open={settingsOpen} />

<QuickAdd listName={data.list.name} result={form?.add ?? null} />

<!-- The items filling in, as the worker goes: said once, politely, never stealing the focus -->
<div role="status" class="visually-hidden">{heard}</div>

<div role="status" class="visually-hidden">
  {#if moved}
    {moved}
  {:else if form?.move && "title" in form.move}
    {m.place(form.move.title, form.move.position, form.move.count)}
  {:else if form?.reveal && "lifted" in form.reveal}
    {m.secretLifted}
  {:else if form?.refresh && "itemId" in form.refresh && "title" in form.refresh}
    {m.refreshAsked(form.refresh.title)}
  {:else if form?.edit && "title" in form.edit}
    {m.saved(form.edit.title, form.edit.listId !== data.list.id)}
  {:else if form?.status && "status" in form.status}
    {m.statusChanged(form.status.title, form.status.status)}
  {:else if form?.remove && "title" in form.remove}
    {m.deleted(form.remove.title)}
  {/if}
</div>

{#if form?.remove && "error" in form.remove}
  <p class="notice error" role="alert">{removal.failed}</p>
{/if}

<section aria-labelledby="envies-titre">
  <h2 id="envies-titre">{m.wishes(open.length)}</h2>
  {#if open.length === 0}
    <p class="muted">{m.empty}</p>
  {:else}
    {#if form?.move && "error" in form.move}
      <p class="notice error" role="alert">{m.orderChanged}</p>
    {/if}
    <form method="POST" action="?/order" bind:this={orderForm} use:enhance={() => settle()} hidden>
      {#each order ?? [] as id (id)}<input type="hidden" name="itemIds" value={id} />{/each}
    </form>
    <ul class="items" bind:this={list}>
      {#each shown as item, index (item.id)}
        {@const link = webLink(item)}
        <li
          class="card item"
          class:dragging={dragging === item.id}
          class:sortable={shown.length > 1}
          data-id={item.id}
        >
          {#if shown.length > 1}
            <form
              method="POST"
              action="?/move"
              class="mover"
              use:enhance={({ formData }) => {
                const direction = String(formData.get("direction"));
                const ids = shown.map((entry) => entry.id);
                const next = moveId(ids, item.id, index + (direction === "up" ? -1 : 1));
                order = next;
                place(item.id, next);
                return settle({ id: item.id, direction });
              }}
            >
              <input type="hidden" name="itemId" value={item.id} />
              <button
                type="submit"
                name="direction"
                value="up"
                class="secondary"
                disabled={index === 0}
                aria-label={m.moveUp(item.title)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
              </button>
              <span
                class="grip"
                aria-hidden="true"
                title={m.grip}
                onpointerdown={(event) => drag(event, item.id)}
              >
                <svg viewBox="0 0 24 24">
                  {#each [6, 12, 18] as y (y)}<circle cx="9" cy={y} r="1.6" /><circle
                      cx="15"
                      cy={y}
                      r="1.6"
                    />{/each}
                </svg>
              </span>
              <button
                type="submit"
                name="direction"
                value="down"
                class="secondary"
                disabled={index === shown.length - 1}
                aria-label={m.moveDown(item.title)}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </form>
          {/if}
          <ItemThumb {item} listId={data.list.id} {images} />
          <div class="text">
            <h3>{item.title}</h3>
            <p class="muted meta">
              {#if kindLine(item)}<span class="kind">{kindLine(item)}</span>{/if}
              {#if item.priceCents !== null}<span class="price">{i18n.fmt.money(item.priceCents)}</span>{/if}
              {#if link}
                <a class="site" href={link} rel="noopener noreferrer external" target="_blank">
                  {host(link)}<Icon name="external" size="1rem" /><span class="visually-hidden">
                    {m.newTab}
                  </span>
                </a>
              {/if}
            </p>
            {#if item.notes}<p class="notes">{item.notes}</p>{/if}
            {#if isLive(stage(item))}
              {@const findingImages = stage(item) === "images"}
              {@const help = findingImages ? m.findingImagesWhat : m.readingWhat(images)}
              <!-- An icon that says the step, its words next to it, the longer help on hover -->
              <p class="completing" title={help}>
                <StageIcon stage={findingImages ? "images" : "reading"} />
                <span class="reading">{findingImages ? m.findingImages : m.reading}</span>
                <span class="visually-hidden">{help}</span>
              </p>
            {:else if item.enrichment === "failed"}
              <p class="completing">
                <StageIcon stage="failed" />
                <span class="reading failed">{m.unreadable}</span>
              </p>
              <p class="muted help">{m.unreadableHelp}</p>
            {/if}
            {#if data.gifts[item.id]?.length}<Gifts gifts={data.gifts[item.id] ?? []} none="" />{/if}
          </div>
          <!-- The same icons, in the same order, on every card; « reload », only for a link, comes
               first so that the others stay lined up from one card to the next -->
          <div class="tools">
            {#if link && item.enrichment !== "pending"}
              <form method="POST" action="?/refresh" use:enhance={reread}>
                <input type="hidden" name="itemId" value={item.id} />
                <IconButton icon="reload" label={m.refresh.label(item.title)} tip={m.refresh.tip} />
              </form>
            {/if}
            <form method="POST" action="?/status" use:enhance>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="status" value="received" />
              <IconButton icon="heart" label={m.receivedLabel(item.title)} tip={m.received} />
            </form>
            <IconButton
              icon="pencil"
              label={m.edit.label(item.title)}
              tip={m.edit.tip}
              href="?modifier={item.id}"
              expanded={editing === item.id}
              controls="edit-{item.id}"
              onclick={() => toggleEdit(item.id)}
            />
            <form method="POST" action="?/status" use:enhance>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="status" value="archived" />
              <IconButton icon="archive" label={m.archiveLabel(item.title)} tip={m.archiveTip} />
            </form>
            <ConfirmDelete
              label={m.deleteLabel(item.title)}
              tip={m.deleteTip}
              title={removal.itemTitle(item.title)}
              help={[removal.itemHelp, removal.guests, removal.archiveInstead]}
              action="?/deleteItem"
              fields={{ itemId: item.id, title: item.title }}
            />
          </div>
          {#if editing === item.id}
            <ItemEditor
              {item}
              lists={data.lists}
              failed={failedEdit(item)}
              onclose={() => toggleEdit(item.id)}
            />
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if closed.length > 0}
  <details class="closed">
    <summary>{m.closed(closed.length)}</summary>
    <ul class="items">
      {#each closed as item (item.id)}
        <li class="card item">
          <ItemThumb {item} listId={data.list.id} {images} small />
          <div class="text">
            <h3>{item.title}</h3>
            <p class="muted meta state">
              <Icon name={item.status === "received" ? "heart" : "archive"} size="1rem" />
              {item.status === "received" ? m.receivedState : m.archivedState}
            </p>
            {#if data.gifts[item.id]}
              <Gifts gifts={data.gifts[item.id] ?? []} none={m.noGiftOutside} />
            {/if}
          </div>
          <div class="tools">
            <form method="POST" action="?/status" use:enhance>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="status" value="open" />
              <IconButton icon="restore" label={m.reopenLabel(item.title)} tip={m.reopen} />
            </form>
            <ConfirmDelete
              label={m.deleteLabel(item.title)}
              tip={m.deleteTip}
              title={removal.itemTitle(item.title)}
              help={[removal.itemHelp, removal.guests]}
              action="?/deleteItem"
              fields={{ itemId: item.id, title: item.title }}
            />
          </div>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .back {
    margin: 0 0 0.5rem;
  }
  .back a {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-height: 44px;
    font-weight: 600;
    text-decoration: none;
  }
  .back a:hover {
    text-decoration: underline;
  }
  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-width: 0;
  }
  .heading h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .actions,
  .tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }
  /* One grid for every card: the square of the image, the words, the icons; the arrows in front
     when the list can be reordered, the editor under them all */
  .item {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "thumb text"
      "tools tools"
      "editor editor";
    align-items: start;
    gap: 0.75rem 1rem;
    padding: 1rem;
  }
  .item.sortable {
    grid-template-columns: auto auto minmax(0, 1fr);
    grid-template-areas:
      "mover thumb text"
      "mover tools tools"
      "editor editor editor";
  }
  .tools {
    grid-area: tools;
    justify-content: flex-end;
  }
  @media (min-width: 40rem) {
    .item {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas:
        "thumb text tools"
        "editor editor editor";
      padding: 1.25rem;
    }
    .item.sortable {
      grid-template-columns: auto auto minmax(0, 1fr) auto;
      grid-template-areas:
        "mover thumb text tools"
        "editor editor editor editor";
    }
    .item {
      align-items: center;
    }
    .tools {
      flex-wrap: nowrap;
    }
  }
  .text {
    grid-area: text;
    min-width: 0;
    align-self: center;
  }
  .mover {
    grid-area: mover;
    margin-left: -0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
  }
  .mover button {
    min-height: 2.25rem;
    width: 2.75rem;
    padding: 0;
    display: grid;
    place-items: center;
  }
  .mover button:disabled {
    visibility: hidden;
  }
  .mover svg {
    width: 1.4rem;
    height: 1.4rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .grip {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.25rem;
    border-radius: 8px;
    color: var(--text-2);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .grip:hover {
    background: var(--surface-2, var(--border));
  }
  .grip svg {
    fill: currentColor;
    stroke: none;
  }
  .dragging {
    border-color: var(--action);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
    position: relative;
    z-index: 1;
  }
  .dragging .grip {
    cursor: grabbing;
  }
  h3 {
    font-size: 1.15rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 1rem;
    margin: 0.25rem 0 0;
  }
  .kind {
    color: var(--text);
    font-weight: 600;
  }
  .price {
    color: var(--text);
    font-weight: 700;
  }
  .site {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    min-width: 0;
    overflow-wrap: anywhere;
  }
  .state {
    gap: 0.4rem;
  }
  .completing {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
  }
  /* « Lecture du lien »: seen at a glance, by an icon that says the step and its words, never by
     colour alone; icon and words on one line, centred on each other */
  .reading {
    min-width: 0;
    font-weight: 600;
    line-height: 1.2;
  }
  .failed {
    color: var(--text-2);
  }
  .help {
    margin: 0.25rem 0 0;
    font-size: 0.95rem;
  }
  .notes {
    margin: 0.5rem 0 0;
    white-space: pre-line;
  }
  .closed {
    margin-top: 2rem;
  }
  summary {
    min-height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
  }
  .closed .items {
    margin-top: 0.75rem;
  }
  .closed .item {
    grid-template-columns: auto minmax(0, 1fr) auto;
    grid-template-areas: "thumb text tools";
    align-items: center;
  }
</style>
