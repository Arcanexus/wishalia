<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { page } from "$app/state";

  import { liveChanges, type LiveItem } from "@wishalia/domain";

  import { publicMessages } from "@wishalia/i18n/messages/public";
  import { viewMessages } from "@wishalia/i18n/messages/view";
  import Icon from "@wishalia/ui/Icon.svelte";
  import Logo from "@wishalia/ui/Logo.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import { followLive, holding } from "@wishalia/ui/live.ts";
  import DisplayMenu from "@wishalia/ui/DisplayMenu.svelte";
  import HelpMenu from "@wishalia/ui/HelpMenu.svelte";
  import ListBadge from "@wishalia/ui/ListBadge.svelte";
  import EventGauge from "@wishalia/ui/public/EventGauge.svelte";
  import ItemCard from "@wishalia/ui/public/ItemCard.svelte";
  import SeriesCard from "@wishalia/ui/public/SeriesCard.svelte";
  import type { PublicItem } from "@wishalia/ui/public/types.ts";

  import GiveForm from "#lib/GiveForm.svelte";
  import {
    canGive,
    cardPrice,
    cardsOf,
    filterCards,
    NO_FILTER,
    type CardFilter,
    gauge,
    formatDay,
    formatEuros,
    givableTogether,
    heading,
    myGiftLine,
    volumesOf,
    withdrawError,
  } from "@wishalia/ui/public/view.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(publicMessages(i18n.locale).list);
  const v = $derived(viewMessages(i18n.locale).page);
  const view = $derived(data.view);
  const owner = $derived(view.owner.displayName);
  const volumes = $derived(volumesOf(view.items));
  const openEvents = $derived(view.events.filter((event) => event.open));
  const eventsById = $derived(new Map(view.events.map((event) => [event.id, event])));
  /** The open events a gift can be for: on a list link, those of the item. */
  const giftEvents = (eventIds: string[]) =>
    view.scope === "event"
      ? []
      : eventIds.flatMap((id) => {
          const event = eventsById.get(id);
          return event?.open ? [event] : [];
        });
  // The chips above the cards (docs/public-view.md): never for the owner nor on a folded page, where
  // where the gifts stand must stay hidden; with JavaScript only, the cards all show without it
  let hydrated = $state(false);
  onMount(() => (hydrated = true));
  const f = $derived(m.filters);
  let filter = $state<CardFilter>({ ...NO_FILTER });
  const cards = $derived(cardsOf(view.items));
  const mineIds = $derived(new Set(data.mine.map((gift) => gift.itemId)));
  const filtering = $derived(hydrated && view.viewer !== "owner" && !data.folded && cards.length > 3);
  const tagged = (eventId: string) =>
    cards.filter((item) =>
      [item, ...(volumes.get(item.id) ?? [])].some((one) => one.eventIds.includes(eventId)),
    ).length;
  /** An occasion's chip, when it leaves out some wishes and keeps some. */
  const chipEvents = $derived(
    view.scope === "list"
      ? openEvents.filter((event) => tagged(event.id) > 0 && tagged(event.id) < cards.length)
      : [],
  );
  const priced = $derived(
    cards.filter((item) => cardPrice(item, volumes.get(item.id) ?? []) !== null).length > 1,
  );
  const shown = $derived(filtering ? filterCards(cards, volumes, filter, mineIds) : cards);
  const filtered = $derived(filter.toGive || filter.eventId !== null || filter.mine || filter.byPrice);
  const overall = $derived(view.viewer === "owner" || data.folded ? null : gauge(view.items));
  // « 24 décembre », « 24 December »: the year goes without saying for the next occasions
  const shortDay = $derived(
    new Intl.DateTimeFormat(i18n.fmt.tag, { day: "numeric", month: "long", timeZone: "UTC" }),
  );
  const short = (date: string) => shortDay.format(new Date(`${date}T00:00:00Z`));

  // While the owner's items are completed from their links, the page follows them live
  // (docs/live-updates.md): a few-byte question now and then, a reload only when something moved,
  // never while a gift is being written
  const completing = $derived(view.items.some((item) => item.stage));
  $effect(() => {
    if (!completing) return;
    const follower = untrack(() =>
      followLive({
        url: `/s/${encodeURIComponent(page.params.token ?? "")}/suivi`,
        reload: () => invalidate("wishalia:view"),
        canReload: () => !holding(),
      }),
    );
    return () => follower.stop();
  });
  // What a screen reader hears once an item is up to date: one polite line
  let heard = $state("");
  let before: LiveItem[] = [];
  $effect(() => {
    const now = view.items.map((item) => ({
      id: item.id,
      title: item.title,
      priceCents: item.priceCents,
      stage: item.stage ?? null,
      image: item.image?.small ?? null,
    }));
    const done = liveChanges(before, now).filter((change) => change.kind === "done");
    before = now;
    if (done.length > 0)
      heard = done.map((change) => viewMessages(i18n.locale).updated(change.title)).join(" ");
  });
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta name="description" content={data.meta.description} />
  <meta property="og:title" content={data.meta["og:title"]} />
  <meta property="og:description" content={data.meta["og:description"]} />
  <meta property="og:type" content={data.meta["og:type"]} />
</svelte:head>

<header class="top">
  <div class="bar">
    <span class="brand"><Logo size={36} ring={false} /><span>{data.appName}</span></span>
    <div class="tools">
      <HelpMenu help={data.help} topics={["give", "surprise", "display"]} />
      <DisplayMenu
        mode={data.mode}
        theme={data.themeChoice}
        text={data.textSize}
        returnPath={page.url.pathname}
      />
    </div>
  </div>
</header>

<main id="contenu" class="page">
  <p class="hello">{view.open ? v.welcome : v.hello(view.audience)}</p>
  {#if view.list}
    <div class="title">
      <ListBadge picture={view.list} size="medium" />
      <h1 id="titre" tabindex="-1">{heading(view, i18n.locale)}</h1>
    </div>
  {:else}
    <h1 id="titre" tabindex="-1">{heading(view, i18n.locale)}</h1>
  {/if}
  <p class="muted lead">
    {view.event ? v.wishesOfFor(owner, formatDay(view.event.date, i18n.locale)) : v.wishesOf(owner)}
  </p>

  {#if view.viewer === "owner"}
    <div class="notice owner" role="note">
      <p>
        <strong>{m.own.strong}</strong>{m.own.text}
      </p>
    </div>
  {:else if data.folded}
    <section class="card fold" aria-labelledby="fold-title">
      <h2 id="fold-title">{m.notOwner(owner)}</h2>
      <p>{m.folded(owner)}</p>
      <form
        method="POST"
        action="?/unfold"
        use:enhance={() =>
          async ({ update }) => {
            await update();
            // The button is gone: bring the reader back to the top of the list
            document.getElementById("titre")?.focus();
          }}
      >
        <button type="submit">{m.unfold(owner)}</button>
      </form>
      <p class="muted small">{m.unfoldWarning(owner)}</p>
    </section>
  {:else if view.event && !view.event.open}
    <p class="notice">{m.eventPast}</p>
  {:else if openEvents.length > 0 && view.scope === "list"}
    <p class="muted">
      {m.next(
        openEvents.length,
        i18n.fmt.list(openEvents.map((event) => m.eventOn(event.name, short(event.date)))),
      )}
    </p>
  {/if}

  {#if data.gone.length > 0}
    <section class="card gone" aria-labelledby="gone-title">
      <h2 id="gone-title">{m.gone.title}</h2>
      <ul>
        {#each data.gone as gift (gift.id)}
          <li>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="9.5" /><path d="M12 7.5v5.5" /><path d="M12 16.5v.01" />
            </svg>
            <div class="said">
              <p>{gift.state === "archived" ? m.gone.archived(gift.title) : m.gone.deleted(gift.title)}</p>
              {#if gift.state === "archived" || gift.onDevice}
                <form method="POST" action="?/withdraw" use:enhance>
                  <input type="hidden" name="id" value={gift.id} />
                  {#if gift.state === "archived"}
                    <button type="submit" class="secondary" aria-label={m.gone.withdrawLabel(gift.title)}>
                      {m.gone.withdraw}
                    </button>
                  {:else if gift.onDevice}
                    <!-- This device forgets the gift: the notice goes -->
                    <button type="submit" class="secondary" aria-label={m.gone.dismissLabel(gift.title)}>
                      {m.gone.dismiss}
                    </button>
                  {/if}
                </form>
              {/if}
              {#if form?.withdraw && "id" in form.withdraw && form.withdraw.id === gift.id}
                <p class="notice error" role="alert">{withdrawError(form.withdraw.error, i18n.locale)}</p>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
    </section>
  {/if}

  {#if overall}
    <EventGauge gauge={overall} label={view.event ? v.gaugeEvent : v.gaugeList} />
  {/if}

  {#if view.items.length === 0}
    <p class="card empty">{v.empty}</p>
  {:else}
    {#if filtering}
      <div class="chips" role="group" aria-label={f.label}>
        <button
          type="button"
          class="chip"
          aria-pressed={filter.toGive}
          onclick={() => (filter.toGive = !filter.toGive)}
        >
          <Icon name="gift" />{f.toGive}
        </button>
        {#each chipEvents as event (event.id)}
          <button
            type="button"
            class="chip"
            aria-pressed={filter.eventId === event.id}
            onclick={() => (filter.eventId = filter.eventId === event.id ? null : event.id)}
          >
            <Icon name="calendar" />{event.name}
          </button>
        {/each}
        {#if priced}
          <button
            type="button"
            class="chip"
            aria-pressed={filter.byPrice}
            title={f.byPriceTip}
            onclick={() => (filter.byPrice = !filter.byPrice)}
          >
            <Icon name="sort" />{f.byPrice}
          </button>
        {/if}
        {#if mineIds.size > 0}
          <button
            type="button"
            class="chip"
            aria-pressed={filter.mine}
            onclick={() => (filter.mine = !filter.mine)}
          >
            <Icon name="heart" />{f.mine}
          </button>
        {/if}
      </div>
      <p class="muted shown" role="status">{filtered ? f.shown(shown.length, cards.length) : ""}</p>
    {/if}
    {#if shown.length === 0}
      <p class="card empty">{f.none}</p>
    {/if}
    <ul class="items">
      {#each shown as item (item.id)}
        {#if item.kind === "series"}
          <!-- One card for the series, each volume inside it given on its own (docs/series.md) -->
          <SeriesCard
            series={item}
            volumes={volumes.get(item.id) ?? []}
            events={view.events}
            scope={view.scope}
            volume={giving}
            all={givingAll}
          />
        {:else}
          <ItemCard {item} events={view.events} scope={view.scope}>{@render giving(item)}</ItemCard>
        {/if}
      {/each}
    </ul>
  {/if}

  <div class="visually-hidden" role="status">{heard}</div>
  <div class="visually-hidden" role="status">
    {#if form?.given}{m.given}{:else if form?.withdrawn}{m.withdrawn}{:else if form?.unfolded}{m.unfolded}{/if}
  </div>
</main>

{#snippet givingAll(series: PublicItem)}
  <!-- « Offrir les N tomes restants »: each free volume bought whole, in one form (docs/series.md) -->
  {@const free = givableTogether(volumes.get(series.id) ?? [], view)}
  {#if form?.given?.itemId === series.id}
    <p class="notice thanks">{m.thanks(owner)}</p>
  {/if}
  {#if !data.folded && free.length > 0}
    {@const prices = free.flatMap((volume) => volume.priceCents ?? [])}
    <GiveForm
      item={series}
      events={giftEvents(series.eventIds)}
      {owner}
      needsName={view.me === null}
      guestName={data.guestName}
      failed={form?.give && form.give.itemId === series.id ? form.give : null}
      all={{
        ids: free.map((volume) => volume.id),
        label: publicMessages(i18n.locale).give.allLabel(
          free.length,
          prices.length === free.length
            ? formatEuros(
                prices.reduce((a, b) => a + b, 0),
                i18n.locale,
              )
            : null,
        ),
      }}
    />
  {/if}
{/snippet}

{#snippet giving(item: PublicItem)}
  {#each data.mine.filter((gift) => gift.itemId === item.id) as gift (gift.id)}
    <div class="mine">
      <p>
        <strong>{myGiftLine(gift, item, i18n.locale)}</strong>
        {#if gift.eventId && view.scope === "list" && eventsById.get(gift.eventId)}
          <span class="muted">{m.forEvent(eventsById.get(gift.eventId)?.name ?? "")}</span>
        {/if}
      </p>
      <form method="POST" action="?/withdraw" use:enhance>
        <input type="hidden" name="id" value={gift.id} />
        <button type="submit" class="secondary" aria-label={m.withdrawLabel(item.title)}>
          {m.withdraw}
        </button>
      </form>
      {#if form?.withdraw && "id" in form.withdraw && form.withdraw.id === gift.id}
        <p class="notice error" role="alert">{withdrawError(form.withdraw.error, i18n.locale)}</p>
      {/if}
    </div>
  {/each}

  {#if form?.given?.itemId === item.id}
    <p class="notice thanks">{m.thanks(owner)}</p>
  {/if}

  {#if !data.folded && canGive(item, view)}
    <GiveForm
      {item}
      events={giftEvents(item.eventIds)}
      {owner}
      needsName={view.me === null}
      guestName={data.guestName}
      failed={form?.give && form.give.itemId === item.id ? form.give : null}
      short={Boolean(item.parentId)}
    />
  {/if}
{/snippet}

<style>
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.3rem;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .page {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }
  .hello {
    font-weight: 600;
    margin: 0 0 0.25rem;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    margin: 0.25rem 0 0.5rem;
  }
  .title h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .lead {
    margin-top: 0;
  }
  .owner {
    margin-bottom: 1.5rem;
  }
  .owner p {
    margin: 0;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0;
    display: grid;
    gap: 1rem;
  }
  .gone {
    margin: 0 0 1.5rem;
    border-left: 4px solid var(--accent);
  }
  .gone h2 {
    margin: 0 0 0.75rem;
    font-size: 1.2rem;
  }
  .gone ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 1rem;
  }
  .gone li {
    display: flex;
    gap: 0.75rem;
    align-items: flex-start;
  }
  .gone svg {
    flex: none;
    width: 1.5rem;
    height: 1.5rem;
    margin-top: 0.1rem;
    fill: none;
    stroke: var(--text);
    stroke-width: 2.2;
    stroke-linecap: round;
  }
  .gone p {
    margin: 0 0 0.5rem;
  }
  .mine {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-top: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    border: 2px solid var(--action);
  }
  .mine p {
    margin: 0;
  }
  .mine .notice {
    flex-basis: 100%;
  }
  .fold {
    margin: 1rem 0 1.5rem;
    border-width: 2px;
    border-color: var(--action);
  }
  .fold h2 {
    margin-top: 0;
  }
  .fold form {
    margin: 1rem 0 0.5rem;
  }
  .thanks {
    margin: 0.75rem 0 0;
  }
  .empty {
    margin: 1.5rem 0;
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 1.25rem 0 0;
  }
  .chip {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 2.75rem;
    padding: 0 0.9rem;
    border-radius: 999px;
    border: 2px solid var(--border);
    background: var(--surface);
    color: var(--text);
    font-weight: 600;
  }
  .chip[aria-pressed="true"] {
    background: var(--action);
    border-color: var(--action);
    color: var(--on-action);
  }
  .shown {
    margin: 0.5rem 0 0;
    min-height: 1.5em;
  }
  .shown + .items {
    margin-top: 0.75rem;
  }
</style>
