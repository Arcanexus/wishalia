<script lang="ts">
  import { resolve } from "$app/paths";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { viewMessages } from "@wishalia/i18n/messages/view";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import EventGauge from "@wishalia/ui/public/EventGauge.svelte";
  import ItemCard from "@wishalia/ui/public/ItemCard.svelte";
  import { gauge } from "@wishalia/ui/public/view.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const overall = $derived(gauge(data.items));
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
  <h1>{data.list.name}</h1>
  <p class="muted lead">{v.wishesOf(data.me.displayName)}</p>

  {#if overall}
    <EventGauge gauge={overall} label={v.gaugeList} />
  {/if}

  {#if data.items.length === 0}
    <p class="card empty">{v.empty}</p>
  {:else}
    <ul class="items">
      {#each data.items as item (item.id)}
        <ItemCard {item} events={[]} scope="list" />
      {/each}
    </ul>
  {/if}

  <p class="muted secret">{v.secret(data.me.displayName)}</p>
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
  .secret {
    text-align: center;
    margin-top: 2rem;
  }
</style>
