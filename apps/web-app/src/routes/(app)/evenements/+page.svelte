<script lang="ts">
  import { resolve } from "$app/paths";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import EventFields from "#lib/EventFields.svelte";
  import { today } from "#lib/format.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const all = $derived(appMessages(i18n.locale));
  const m = $derived(all.events);

  const now = today();
  const upcoming = $derived(data.events.filter((event) => event.date >= now));
  // The most recent first: the one whose secret may soon be lifted
  const past = $derived(data.events.filter((event) => event.date < now).reverse());
</script>

<svelte:head>
  <title>{m.title} · {data.appName}</title>
</svelte:head>

<h1>{m.title}</h1>
<p class="muted intro">{m.intro}</p>

{#snippet eventCard(event: (typeof data.events)[number])}
  <li>
    <a class="card event" href={resolve("/(app)/evenements/[id]", { id: event.id })}>
      <span class="name">{event.name}</span>
      <span class="muted">{all.eventKinds[event.kind]} · {i18n.fmt.day(event.date)}</span>
      {#if event.secretLifted}
        <span class="tag">{m.lifted}</span>
      {:else if event.canReveal}
        <span class="tag ready">{m.ready}</span>
      {/if}
    </a>
  </li>
{/snippet}

<section aria-labelledby="a-venir">
  <h2 id="a-venir">{m.upcoming}</h2>
  {#if upcoming.length === 0}
    <p class="muted">{m.noneUpcoming}</p>
  {:else}
    <ul class="events">
      {#each upcoming as event (event.id)}{@render eventCard(event)}{/each}
    </ul>
  {/if}
</section>

{#if past.length > 0}
  <section aria-labelledby="passes">
    <h2 id="passes">{m.past}</h2>
    <ul class="events">
      {#each past as event (event.id)}{@render eventCard(event)}{/each}
    </ul>
  </section>
{/if}

<section class="card create" aria-labelledby="nouvel-evenement">
  <h2 id="nouvel-evenement">{m.new}</h2>
  <form method="POST" action="?/create">
    <EventFields values={form?.create ?? null} error={form?.create?.error ?? null} />
    <button type="submit">{m.create}</button>
  </form>
</section>

<style>
  .intro {
    margin: -0.25rem 0 1.5rem;
  }
  .events {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    display: grid;
    gap: 0.75rem;
  }
  .event {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    color: var(--text);
    text-decoration: none;
  }
  .event:hover {
    border-color: var(--action);
  }
  .name {
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.2rem;
  }
  .tag {
    align-self: flex-start;
    margin-top: 0.3rem;
    padding: 0.1rem 0.6rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    font-size: 0.9rem;
    font-weight: 600;
  }
  .tag.ready {
    background: var(--action);
    color: var(--on-action);
    border-color: var(--action);
  }
  .create {
    margin-top: 1rem;
  }
</style>
