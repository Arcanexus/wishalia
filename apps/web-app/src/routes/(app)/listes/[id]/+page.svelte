<script lang="ts">
  import { tick, untrack } from "svelte";
  import { enhance, type SubmitFunction } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import {
    inReadingOrder,
    isLive,
    liveChanges,
    seriesPriceCents,
    volumeLabel,
    type LiveItem,
  } from "@wishalia/domain";
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
  import SeriesEditor from "#lib/SeriesEditor.svelte";
  import StageIcon from "@wishalia/ui/StageIcon.svelte";
  import IconButton from "#lib/IconButton.svelte";
  import { changes } from "#lib/changes.svelte.ts";
  import { dropIndex, moveId, shownOrder } from "#lib/reorder.ts";
  import { itemStage } from "#lib/stage.ts";
  import type { Item } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).list);
  const removal = $derived(appMessages(i18n.locale).removal);
  const s = $derived(appMessages(i18n.locale).series);

  // The list's own wishes; the volumes of a series show inside its card (docs/series.md)
  // The changes made here and saved in the background (#lib/outbox.ts): the page shows their
  // result at once, before the server has them (docs/management-app.md, « Saved in the background »)
  const path = $derived(resolve("/(app)/listes/[id]", { id: data.list.id }));
  const mine = $derived(changes.state.changes.filter((change) => change.listId === data.list.id));
  const deleting = $derived(
    new Set(mine.flatMap((change) => (change.kind === "delete" && change.itemId ? [change.itemId] : []))),
  );
  /** Item id → the status it is getting (the latest change wins). */
  const statusOf = $derived(
    new Map(
      mine.flatMap((change) =>
        change.kind === "status" && change.itemId && change.status ? [[change.itemId, change.status]] : [],
      ),
    ),
  );
  const saved = $derived(mine.findLast((change) => change.kind === "order")?.order ?? null);
  const items = $derived(
    data.items
      .filter((item) => !deleting.has(item.id) && !deleting.has(item.parentId ?? ""))
      .map((item) => {
        const status = statusOf.get(item.id);
        return status ? { ...item, status: status as Item["status"] } : item;
      }),
  );
  /** Off the screen at once; the keyboard goes to the list's heading, the bin it was on is gone. */
  const remove = async (item: Item) => {
    changes.add({
      kind: "delete",
      path,
      action: "deleteItem",
      fields: [
        ["itemId", item.id],
        ["title", item.title],
        ["confirm", "oui"],
      ],
      listId: data.list.id,
      itemId: item.id,
      title: item.title,
    });
    moved = m.deleted(item.title);
    await tick();
    document.getElementById("envies-titre")?.focus();
  };
  /** Received, archived or open again: at once on screen, saved behind (the form without JavaScript). */
  const setStatus =
    (item: Item, status: Item["status"]): SubmitFunction =>
    ({ cancel }) => {
      cancel();
      changes.add({
        kind: "status",
        key: `status:${item.id}`,
        path,
        action: "status",
        fields: [
          ["itemId", item.id],
          ["status", status],
        ],
        listId: data.list.id,
        itemId: item.id,
        title: item.title,
        status,
      });
      moved = m.statusChanged(item.title, status);
    };
  /** A volume one place up or down: in turn with the other changes, so two taps never race. */
  const moveVolume =
    (volume: Item): SubmitFunction =>
    ({ cancel, formData }) => {
      cancel();
      changes.add({
        kind: "moveVolume",
        path,
        action: "moveVolume",
        fields: [
          ["itemId", volume.id],
          ["direction", String(formData.get("direction"))],
        ],
        listId: data.list.id,
        itemId: volume.id,
        title: volume.title,
      });
    };
  const own = $derived(items.filter((item) => !item.parentId));
  const open = $derived(own.filter((item) => item.status === "open"));
  /** Series id → its volumes, in their order. */
  const volumesBy = $derived(
    Map.groupBy(
      [...items].filter((item) => item.parentId).sort((a, b) => a.position - b.position),
      (item) => item.parentId ?? "",
    ),
  );
  /** What is still wanted: the open wishes of their own, and the open volumes of open series. */
  const working = $derived([
    ...open.filter((item) => item.kind !== "series"),
    ...open.flatMap((item) =>
      item.kind === "series"
        ? (volumesBy.get(item.id) ?? []).filter((volume) => volume.status === "open")
        : [],
    ),
  ]);
  /** The wishes of their own that can go into a series: never a series itself. */
  const candidates = $derived(open.filter((item) => item.kind !== "series"));
  const images = $derived(data.me.features?.images ?? false);
  const byId = $derived(new Map(open.map((item) => [item.id, item])));

  // While the worker completes items from their links, the page follows it live
  // (docs/live-updates.md): a few-byte question every 2 seconds, then every 10, and the list loads
  // again only when something changed. Never with the tab hidden, never without a reason.
  const completing = $derived(working.some((item) => isLive(stage(item))));
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
        canReload: () => !order && !dragging && changes.state.changes.length === 0 && !holding(),
      }),
    );
    return () => follower.stop();
  });

  // What a screen reader hears as the items fill in: one polite line per item and step
  let heard = $state("");
  let before: LiveItem[] = [];
  $effect(() => {
    const now = working.map(liveItem);
    const changes = liveChanges(before, now);
    before = now;
    if (changes.length > 0) heard = changes.map((change) => m.live[change.kind](change.title)).join(" ");
  });

  // The order on screen while an item is dragged, then the one waiting to be saved (optimistic):
  // moves follow one another without waiting, and only the latest order is sent
  let order = $state<string[] | null>(null);
  let dragging = $state<string | null>(null);
  let moved = $state("");
  let list = $state<HTMLUListElement>();
  const shown = $derived.by(() => {
    const planned = order ?? saved;
    return planned
      ? shownOrder(
          planned,
          open.map((item) => item.id),
        ).flatMap((id) => byId.get(id) ?? [])
      : open;
  });

  const place = (id: string, ids: string[]) => {
    const item = byId.get(id);
    moved = item ? m.place(item.title, ids.indexOf(id) + 1, ids.length) : "";
  };

  /** Moves an item to a place on screen at once, and saves the new order behind it. */
  const reorder = (id: string, next: string[]) => {
    place(id, next);
    changes.add({
      kind: "order",
      key: `order:${data.list.id}`,
      path,
      action: "order",
      fields: next.map((itemId) => ["itemIds", itemId]),
      listId: data.list.id,
      order: next,
    });
    order = null;
  };

  /** One place up or down with the arrows: the keyboard stays on the item, on an arrow that still goes. */
  const step = async (event: MouseEvent, id: string, direction: "up" | "down") => {
    event.preventDefault();
    const ids = shown.map((entry) => entry.id);
    const from = ids.indexOf(id);
    const next = moveId(ids, id, from + (direction === "up" ? -1 : 1));
    if (next.join() === ids.join()) return;
    reorder(id, next);
    // A moved node can lose the focus, and the arrow is gone at the top or the bottom
    await tick();
    const li = list?.querySelector(`li[data-id="${id}"]`);
    const same = li?.querySelector<HTMLButtonElement>(`button[value="${direction}"]`);
    const other = li?.querySelector<HTMLButtonElement>(
      `button[name="direction"]:not([value="${direction}"])`,
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
    const drop = (end: PointerEvent) => {
      handle.removeEventListener("pointermove", follow);
      handle.removeEventListener("pointerup", drop);
      handle.removeEventListener("pointercancel", drop);
      dragging = null;
      if (end.type === "pointercancel" || !order || order.join() === before.join()) {
        // Nothing moved: back to the order on its way, if any, or to the server's
        order = null;
        return;
      }
      reorder(id, order);
    };
    handle.addEventListener("pointermove", follow);
    handle.addEventListener("pointerup", drop);
    handle.addEventListener("pointercancel", drop);
  }
  const closed = $derived(own.filter((item) => item.status !== "open"));

  /** After a « Recharger »: the page shows « Lecture du lien… » and looks again, from the start. */
  const reread =
    () =>
    async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      refreshes += 1;
    };
  const linked = $derived(working.some((item) => webLink(item) !== null));
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
  // The series whose « ranger des envies » panel is open (?ranger=…, also without JavaScript)
  let gathering = $state<string | null>(untrack(() => page.url.searchParams.get("ranger")));
  $effect(() => {
    if (form?.series && "gathered" in form.series) gathering = null;
  });
  /** A wish whose name starts like the series': ticked in advance. */
  const belongs = (item: Item, series: Item) => volumeLabel(item.title, series.title) !== item.title;
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

<QuickAdd listName={data.list.name} result={form?.add && !("parentId" in form.add) ? form.add : null} />

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
  {:else if form?.volume}
    {s.added(form.volume.title)}
  {:else if form?.series && "gathered" in form.series}
    {s.gathered(form.series.gathered, form.series.title)}
  {:else if form?.series && "ungrouped" in form.series}
    {s.ungrouped(form.series.ungrouped)}
  {:else if form?.series && "takenOut" in form.series}
    {s.takenOut(form.series.takenOut)}
  {/if}
</div>

{#if form?.remove && "error" in form.remove}
  <p class="notice error" role="alert">{removal.failed}</p>
{/if}
{#if form?.series && "error" in form.series}
  <p class="notice error" role="alert">{s.failed}</p>
{/if}

<section aria-labelledby="envies-titre">
  <h2 id="envies-titre" tabindex="-1">{m.wishes(working.length)}</h2>
  {#if open.length === 0}
    <p class="muted">{m.empty}</p>
  {:else}
    {#if form?.move && "error" in form.move}
      <p class="notice error" role="alert">{m.orderChanged}</p>
    {/if}
    <ul class="items" bind:this={list}>
      {#each shown as item, index (item.id)}
        {@const link = webLink(item)}
        <li
          class="card item"
          class:dragging={dragging === item.id}
          class:sortable={shown.length > 1}
          class:series={item.kind === "series"}
          data-id={item.id}
        >
          {#if shown.length > 1}
            <!-- Without JavaScript the arrows post the form; with it, they move at once -->
            <form method="POST" action="?/move" class="mover">
              <input type="hidden" name="itemId" value={item.id} />
              <button
                type="submit"
                name="direction"
                value="up"
                class="secondary"
                disabled={index === 0}
                aria-label={m.moveUp(item.title)}
                onclick={(event) => step(event, item.id, "up")}
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
                onclick={(event) => step(event, item.id, "down")}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </form>
          {/if}
          {#if item.kind === "series"}
            {@render seriesCard(item)}
          {:else}
            <ItemThumb {item} listId={data.list.id} {images} />
            <div class="text">
              <h3>{item.title}</h3>
              <p class="muted meta">
                {#if kindLine(item)}<span class="kind">{kindLine(item)}</span>{/if}
                {#if item.priceCents !== null}<span class="price">
                    {i18n.fmt.money(item.priceCents)}
                  </span>{/if}
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
              <form method="POST" action="?/status" use:enhance={setStatus(item, "received")}>
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
              <form method="POST" action="?/status" use:enhance={setStatus(item, "archived")}>
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
                onconfirm={() => remove(item)}
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
              {#if item.kind === "series"}<span>· {s.volumes(volumesBy.get(item.id)?.length ?? 0)}</span>{/if}
            </p>
            {#if data.gifts[item.id]}
              <Gifts gifts={data.gifts[item.id] ?? []} none={m.noGiftOutside} />
            {/if}
          </div>
          <div class="tools">
            <form method="POST" action="?/status" use:enhance={setStatus(item, "open")}>
              <input type="hidden" name="itemId" value={item.id} />
              <input type="hidden" name="status" value="open" />
              <IconButton icon="restore" label={m.reopenLabel(item.title)} tip={m.reopen} />
            </form>
            <ConfirmDelete
              label={m.deleteLabel(item.title)}
              tip={m.deleteTip}
              title={removal.itemTitle(item.title)}
              help={[item.kind === "series" ? removal.seriesHelp : removal.itemHelp, removal.guests]}
              action="?/deleteItem"
              fields={{ itemId: item.id, title: item.title }}
              onconfirm={() => remove(item)}
            />
          </div>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<!-- A series (docs/series.md): one card, as a wish with several copies, its volumes inside it -->
{#snippet seriesCard(series: Item)}
  {@const volumes = volumesBy.get(series.id) ?? []}
  {@const wanted = volumes.filter((volume) => volume.status === "open")}
  {@const total = seriesPriceCents(volumes)}
  <!-- The wishes that look like its volumes first, ticked, in their reading order -->
  {@const others = [
    ...inReadingOrder(candidates.filter((item) => belongs(item, series))),
    ...candidates.filter((item) => !belongs(item, series)),
  ]}
  <ItemThumb
    item={{ ...series, image: series.image ?? wanted.find((volume) => volume.image)?.image ?? null }}
    listId={data.list.id}
    {images}
  />
  <div class="text">
    <h3>{series.title}</h3>
    <p class="muted meta">
      <span class="kind with-icon">
        <Icon name="series" size="1.2rem" />{s.kind}
      </span>
      {#if total !== null}<span class="price">{s.total(i18n.fmt.money(total))}</span>{/if}
    </p>
    {#if series.notes}<p class="notes">{series.notes}</p>{/if}
  </div>
  <div class="tools">
    <IconButton
      icon="pencil"
      label={s.edit.label(series.title)}
      tip={s.edit.tip}
      href="?modifier={series.id}"
      expanded={editing === series.id}
      controls="edit-{series.id}"
      onclick={() => toggleEdit(series.id)}
    />
    <IconButton
      icon="gather"
      label={s.gather.label(series.title)}
      tip={s.gather.tip}
      href="?ranger={series.id}"
      expanded={gathering === series.id}
      controls="ranger-{series.id}"
      onclick={() => (gathering = gathering === series.id ? null : series.id)}
    />
    <form method="POST" action="?/status" use:enhance={setStatus(series, "archived")}>
      <input type="hidden" name="itemId" value={series.id} />
      <input type="hidden" name="status" value="archived" />
      <IconButton icon="archive" label={m.archiveLabel(series.title)} tip={m.archiveTip} />
    </form>
    <form method="POST" action="?/ungroup" use:enhance>
      <input type="hidden" name="itemId" value={series.id} />
      <input type="hidden" name="title" value={series.title} />
      <IconButton icon="ungroup" label={s.ungroup.label(series.title)} tip={s.ungroup.tip} />
    </form>
    <ConfirmDelete
      label={m.deleteLabel(series.title)}
      tip={m.deleteTip}
      title={removal.itemTitle(series.title)}
      help={[removal.seriesHelp, removal.guests, removal.ungroupInstead]}
      action="?/deleteItem"
      fields={{ itemId: series.id, title: series.title }}
      onconfirm={() => remove(series)}
    />
  </div>
  {#if editing === series.id}
    <SeriesEditor
      {series}
      lists={data.lists}
      failed={failedEdit(series)}
      onclose={() => toggleEdit(series.id)}
    />
  {/if}
  {#if gathering === series.id}
    <form method="POST" action="?/gather" class="gather wide" id="ranger-{series.id}" use:enhance>
      <input type="hidden" name="seriesId" value={series.id} />
      <input type="hidden" name="title" value={series.title} />
      <fieldset>
        <legend>{s.gather.legend(series.title)}</legend>
        {#if others.length === 0}
          <p class="muted">{s.gather.none}</p>
        {:else}
          <p class="muted help">{s.gather.help}</p>
          {#each others as other (other.id)}
            <label class="pick">
              <input type="checkbox" name="itemIds" value={other.id} checked={belongs(other, series)} />
              <ItemThumb item={other} listId={data.list.id} images={false} small />
              <span>{other.title}</span>
            </label>
          {/each}
        {/if}
      </fieldset>
      {#if others.length > 0}<button type="submit">{s.gather.submit}</button>{/if}
    </form>
  {/if}
  <!-- Folded by default; open while one of its volumes is being edited -->
  {#if volumes.length === 0}
    <p class="muted wide">{s.empty}</p>
  {:else}
    <details class="fold wide" open={volumes.some((volume) => volume.id === editing)}>
      <summary><Icon name="chevronRight" size="1.2rem" />{s.volumes(volumes.length)}</summary>
      <ol class="volumes" aria-label={appMessages(i18n.locale).series.volumes(volumes.length)}>
        {#each volumes as volume (volume.id)}
          {@render volumeRow(volume, series, wanted)}
        {/each}
      </ol>
    </details>
  {/if}
  <!-- Adding a volume stays at hand, folded or not -->
  <div class="wide">
    <form method="POST" action="?/addVolume" class="add-volume" use:enhance>
      <input type="hidden" name="parentId" value={series.id} />
      <label class="visually-hidden" for="tome-{series.id}">{s.addVolume.label(series.title)}</label>
      <input
        id="tome-{series.id}"
        name="input"
        type="text"
        enterkeyhint="send"
        autocomplete="off"
        maxlength="4000"
        placeholder={s.addVolume.placeholder}
      />
      <IconButton icon="plus" label={s.addVolume.label(series.title)} tip={s.addVolume.tip} />
    </form>
    {#if form?.add && "parentId" in form.add && form.add.parentId === series.id && "error" in form.add}
      <p class="notice error" role="alert">{s.failed}</p>
    {/if}
  </div>
{/snippet}

{#snippet volumeRow(volume: Item, series: Item, wanted: Item[])}
  {@const link = webLink(volume)}
  {@const isOpen = volume.status === "open"}
  {@const place = wanted.indexOf(volume)}
  {@const label = volumeLabel(volume.title, series.title)}
  <li class="volume" class:sortable={isOpen && wanted.length > 1} class:done={!isOpen} data-id={volume.id}>
    {#if isOpen && wanted.length > 1}
      <form method="POST" action="?/moveVolume" class="mover" use:enhance={moveVolume(volume)}>
        <input type="hidden" name="itemId" value={volume.id} />
        <button
          type="submit"
          name="direction"
          value="up"
          class="secondary"
          disabled={place === 0}
          aria-label={s.moveUp(label)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
        </button>
        <button
          type="submit"
          name="direction"
          value="down"
          class="secondary"
          disabled={place === wanted.length - 1}
          aria-label={s.moveDown(label)}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
        </button>
      </form>
    {/if}
    <ItemThumb item={volume} listId={data.list.id} images={images && isOpen} volume />
    <div class="text">
      <h4>{label}</h4>
      <p class="muted meta">
        {#if !isOpen}
          <span class="with-icon">
            <Icon name={volume.status === "received" ? "heart" : "archive"} size="1rem" />
            {volume.status === "received" ? m.receivedState : m.archivedState}
          </span>
        {/if}
        {#if kindLine(volume)}<span class="kind">{kindLine(volume)}</span>{/if}
        {#if volume.priceCents !== null}<span class="price">{i18n.fmt.money(volume.priceCents)}</span>{/if}
        {#if link}
          <a class="site" href={link} rel="noopener noreferrer external" target="_blank">
            {host(link)}<Icon name="external" size="1rem" /><span class="visually-hidden">{m.newTab}</span>
          </a>
        {/if}
      </p>
      {#if isOpen && isLive(stage(volume))}
        {@const findingImages = stage(volume) === "images"}
        <p class="completing" title={findingImages ? m.findingImagesWhat : m.readingWhat(images)}>
          <StageIcon stage={findingImages ? "images" : "reading"} />
          <span class="reading">{findingImages ? m.findingImages : m.reading}</span>
        </p>
      {:else if isOpen && volume.enrichment === "failed"}
        <p class="completing">
          <StageIcon stage="failed" />
          <span class="reading failed">{m.unreadable}</span>
        </p>
      {/if}
      {#if data.gifts[volume.id]?.length}<Gifts gifts={data.gifts[volume.id] ?? []} none="" />{/if}
    </div>
    <div class="tools">
      {#if isOpen}
        {#if link && volume.enrichment !== "pending"}
          <form method="POST" action="?/refresh" use:enhance={reread}>
            <input type="hidden" name="itemId" value={volume.id} />
            <IconButton icon="reload" label={m.refresh.label(volume.title)} tip={m.refresh.tip} />
          </form>
        {/if}
        <form method="POST" action="?/status" use:enhance={setStatus(volume, "received")}>
          <input type="hidden" name="itemId" value={volume.id} />
          <input type="hidden" name="status" value="received" />
          <IconButton icon="heart" label={m.receivedLabel(volume.title)} tip={m.received} />
        </form>
        <IconButton
          icon="pencil"
          label={m.edit.label(volume.title)}
          tip={m.edit.tip}
          href="?modifier={volume.id}"
          expanded={editing === volume.id}
          controls="edit-{volume.id}"
          onclick={() => toggleEdit(volume.id)}
        />
      {:else}
        <form method="POST" action="?/status" use:enhance={setStatus(volume, "open")}>
          <input type="hidden" name="itemId" value={volume.id} />
          <input type="hidden" name="status" value="open" />
          <IconButton icon="restore" label={m.reopenLabel(volume.title)} tip={m.reopen} />
        </form>
      {/if}
      <form method="POST" action="?/takeOut" use:enhance>
        <input type="hidden" name="itemId" value={volume.id} />
        <IconButton icon="takeOut" label={s.takeOut.label(volume.title)} tip={s.takeOut.tip} />
      </form>
      <ConfirmDelete
        label={m.deleteLabel(volume.title)}
        tip={m.deleteTip}
        title={removal.itemTitle(volume.title)}
        help={[removal.itemHelp, removal.guests]}
        action="?/deleteItem"
        fields={{ itemId: volume.id, title: volume.title }}
        onconfirm={() => remove(volume)}
      />
    </div>
    {#if editing === volume.id}
      <ItemEditor
        item={volume}
        lists={data.lists}
        failed={failedEdit(volume)}
        onclose={() => toggleEdit(volume.id)}
      />
    {/if}
  </li>
{/snippet}

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
  /* A series: its panel and its volumes under the card's line, across the whole card */
  .wide {
    grid-column: 1 / -1;
    min-width: 0;
  }
  .with-icon {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
  /* A series' volumes fold under their summary, its chevron turning as it opens */
  .fold summary {
    gap: 0.5rem;
    list-style: none;
  }
  .fold summary::-webkit-details-marker {
    display: none;
  }
  .fold summary :global(.icon) {
    transition: transform 0.15s ease;
  }
  .fold[open] summary :global(.icon) {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .fold summary :global(.icon) {
      transition: none;
    }
  }
  .volumes {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    border-top: 1px solid var(--border);
  }
  /* A volume: the same grid as a card, smaller, one line each */
  .volume {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr);
    grid-template-areas:
      "thumb text"
      "tools tools"
      "editor editor";
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.75rem 0;
    border-bottom: 1px solid var(--border);
  }
  .volume.sortable {
    grid-template-columns: auto auto minmax(0, 1fr);
    grid-template-areas:
      "mover thumb text"
      "mover tools tools"
      "editor editor editor";
  }
  @media (min-width: 40rem) {
    .volume {
      grid-template-columns: auto minmax(0, 1fr) auto;
      grid-template-areas:
        "thumb text tools"
        "editor editor editor";
    }
    .volume.sortable {
      grid-template-columns: auto auto minmax(0, 1fr) auto;
      grid-template-areas:
        "mover thumb text tools"
        "editor editor editor editor";
    }
  }
  .volume .mover {
    margin-left: 0;
  }
  .volume .mover button {
    min-height: 2rem;
    width: 2.5rem;
  }
  h4 {
    font-size: 1.05rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .volume.done h4 {
    color: var(--text-2);
  }
  .add-volume {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    margin-top: 0.75rem;
  }
  .add-volume input[type="text"] {
    flex: 1 1 auto;
    min-width: 0;
  }
  .gather {
    border-top: 1px solid var(--border);
    padding-top: 0.75rem;
  }
  .gather fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 0.75rem;
  }
  .gather legend {
    font-weight: 600;
    padding: 0;
    margin-bottom: 0.25rem;
  }
  .pick {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 48px;
    padding: 0.25rem 0;
    font-weight: 400;
    cursor: pointer;
  }
  .pick input {
    width: 1.4rem;
    height: 1.4rem;
    min-height: 1.4rem;
    flex: none;
    accent-color: var(--action);
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
