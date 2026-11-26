<script lang="ts">
  import { resolve } from "$app/paths";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { viewMessages } from "@wishalia/i18n/messages/view";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import EventGauge from "@wishalia/ui/public/EventGauge.svelte";
  import ItemCard from "@wishalia/ui/public/ItemCard.svelte";
  import SeriesCard from "@wishalia/ui/public/SeriesCard.svelte";
  import ListBadge from "@wishalia/ui/ListBadge.svelte";
  import { cardsOf, gauge, volumesOf } from "@wishalia/ui/public/view.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const overall = $derived(gauge(data.items));
  const volumes = $derived(volumesOf(data.items));
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).preview);
  const v = $derived(viewMessages(i18n.locale).page);
</script>

<svelte:head>
  <title>{m.title(data.list.name)} · {data.appName}</title>
</svelte:head>

<p class="back">
  <a href={resolve("/(app)/listes/[id]", { id: data.list.id })}>← {data.list.name}</a>
</p>

<div class="notice preview" role="note">
  <p><strong>{m.notice.label}</strong>{m.notice.text}</p>
  <p>{m.samples.before}<strong>{m.samples.strong}</strong>{m.samples.after}</p>
</div>

<div class="public">
  <div class="title">
    <ListBadge picture={data.list} size="medium" />
    <h1>{data.list.name}</h1>
  </div>
  <p class="muted lead">{v.wishesOf(data.me.displayName)}</p>

  {#if overall}
    <EventGauge gauge={overall} label={v.gaugeList} />
  {/if}

  {#if data.items.length === 0}
    <p class="card empty">{v.empty}</p>
  {:else}
    <ul class="items">
      {#each cardsOf(data.items) as item (item.id)}
        {#if item.kind === "series"}
          <SeriesCard series={item} volumes={volumes.get(item.id) ?? []} events={[]} scope="list" />
        {:else}
          <ItemCard {item} events={[]} scope="list" />
        {/if}
      {/each}
    </ul>
  {/if}
</div>

<style>
  .back {
    margin: 0 0 0.5rem;
  }
  .preview {
    margin-bottom: 1.5rem;
  }
  .preview p {
    margin: 0;
  }
  .preview p + p {
    margin-top: 0.5rem;
  }
  .public {
    max-width: 48rem;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    margin-bottom: 0.5rem;
  }
  .title h1 {
    margin: 0;
    overflow-wrap: anywhere;
  }
  .lead {
    margin-top: 0;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0;
    display: grid;
    gap: 1rem;
  }
  .empty {
    margin: 1.5rem 0;
  }
</style>
