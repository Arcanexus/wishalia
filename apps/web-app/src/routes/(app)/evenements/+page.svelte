<script lang="ts">
  import { resolve } from "$app/paths";

  import EventFields from "#lib/EventFields.svelte";
  import { eventKindLabel, formatDay, today } from "#lib/format.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const now = today();
  const upcoming = $derived(data.events.filter((event) => event.date >= now));
  // The most recent first: the one whose secret may soon be lifted
  const past = $derived(data.events.filter((event) => event.date < now).reverse());
</script>

<svelte:head>
  <title>Événements · {data.appName}</title>
</svelte:head>

<h1>Événements</h1>
<p class="muted intro">
  Un anniversaire, Noël… Choisissez les envies de chaque événement. Ce qu'on vous offre reste secret jusqu'à
  ce que vous leviez le secret, quelques jours après.
</p>

{#snippet eventCard(event: (typeof data.events)[number])}
  <li>
    <a class="card event" href={resolve("/(app)/evenements/[id]", { id: event.id })}>
      <span class="name">{event.name}</span>
      <span class="muted">{eventKindLabel(event.kind)} · {formatDay(event.date)}</span>
      {#if event.secretLifted}
        <span class="tag">Secret levé</span>
      {:else if event.canReveal}
        <span class="tag ready">Secret à lever</span>
      {/if}
    </a>
  </li>
{/snippet}

<section aria-labelledby="a-venir">
  <h2 id="a-venir">À venir</h2>
  {#if upcoming.length === 0}
    <p class="muted">Aucun événement à venir. Créez-en un ci-dessous.</p>
  {:else}
    <ul class="events">
      {#each upcoming as event (event.id)}{@render eventCard(event)}{/each}
    </ul>
  {/if}
</section>

{#if past.length > 0}
  <section aria-labelledby="passes">
    <h2 id="passes">Passés</h2>
    <ul class="events">
      {#each past as event (event.id)}{@render eventCard(event)}{/each}
    </ul>
  </section>
{/if}

<section class="card create" aria-labelledby="nouvel-evenement">
  <h2 id="nouvel-evenement">Nouvel événement</h2>
  <form method="POST" action="?/create">
    <EventFields values={form?.create ?? null} error={form?.create?.error ?? null} />
    <button type="submit">Créer l'événement</button>
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
