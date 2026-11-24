<script lang="ts">
  import { resolve } from "$app/paths";
  import EventGauge from "@wishalia/ui/public/EventGauge.svelte";
  import ItemCard from "@wishalia/ui/public/ItemCard.svelte";
  import { gauge } from "@wishalia/ui/public/view.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const overall = $derived(gauge(data.items));
</script>

<svelte:head>
  <title>Aperçu de {data.list.name} · {data.appName}</title>
</svelte:head>

<p class="back">
  <a href={resolve("/(app)/listes/[id]", { id: data.list.id })}>← {data.list.name}</a>
</p>

<div class="notice preview" role="note">
  <p>
    <strong>Aperçu :</strong> voici ce que voient vos proches en ouvrant un lien de partage de cette liste.
  </p>
  <p>
    Les participations affichées sont des <strong>exemples inventés</strong> pour l'aperçu : rien de ce que vos
    proches vous offrent vraiment n'y figure. Eux voient aussi, sous chaque envie, un bouton pour l'offrir.
  </p>
</div>

<div class="public">
  <h1>{data.list.name}</h1>
  <p class="muted lead">Les envies de {data.me.displayName}.</p>

  {#if overall}
    <EventGauge gauge={overall} label="Où en est la liste" />
  {/if}

  {#if data.items.length === 0}
    <p class="card empty">La liste est vide pour l'instant. Revenez un peu plus tard !</p>
  {:else}
    <ul class="items">
      {#each data.items as item (item.id)}
        <ItemCard {item} events={[]} scope="list" />
      {/each}
    </ul>
  {/if}

  <p class="muted secret">
    Ce que vous offrez reste secret pour {data.me.displayName}, jusqu'après l'occasion.
  </p>
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
