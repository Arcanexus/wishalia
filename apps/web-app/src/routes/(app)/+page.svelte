<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import QuickAdd from "#lib/QuickAdd.svelte";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const firstName = $derived(data.me.displayName.split(" ")[0] || data.me.displayName);
</script>

<svelte:head>
  <title>Mes listes · {data.appName}</title>
</svelte:head>

<h1>Bonjour {firstName}</h1>

{#if page.url.searchParams.has("archivee")}
  <p class="notice" role="status">
    La liste est archivée : elle ne s'affiche plus, ni pour vous ni pour vos proches.
  </p>
{/if}

<QuickAdd listName={data.lists[0]?.name ?? null} result={form?.add ?? null} />

<section aria-labelledby="listes-titre">
  <h2 id="listes-titre">Mes listes</h2>
  {#if data.lists.length === 0}
    <p class="muted">
      Pas encore de liste : votre première envie en crée une, « Mes envies ». Vous pouvez aussi en créer une
      ci-dessous.
    </p>
  {:else}
    <ul class="lists">
      {#each data.lists as list (list.id)}
        <li>
          <a class="card list" href={resolve("/(app)/listes/[id]", { id: list.id })}>
            <span class="name">{list.name}</span>
            <span class="muted">
              {list.itemCount === 0
                ? "Aucune envie"
                : list.itemCount === 1
                  ? "1 envie"
                  : `${list.itemCount} envies`}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <form method="POST" action="?/createList" use:enhance class="create">
    <label for="nouvelle-liste">Nouvelle liste</label>
    <div class="row">
      <input
        id="nouvelle-liste"
        name="name"
        required
        maxlength="100"
        placeholder="Par exemple « Noël 2026 »"
        value={form?.createList?.name ?? ""}
      />
      <button type="submit">Créer la liste</button>
    </div>
    {#if form?.createList?.error}
      <p class="notice error" role="alert">Donnez un nom à la liste, en 100 caractères au plus.</p>
    {/if}
  </form>

  <p class="import">
    Vos envies sont sur un autre site (Wishlistr, un tableur…) ?
    <a href={resolve("/(app)/importer")}>Importer une liste</a>
  </p>
</section>

<style>
  .lists {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    min-height: 5rem;
    color: var(--text);
    text-decoration: none;
  }
  .list:hover {
    border-color: var(--action);
  }
  .name {
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.2rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  .error {
    margin-top: 0.75rem;
  }
  .import {
    margin-top: 1.5rem;
  }
  @media (max-width: 30rem) {
    .row {
      flex-direction: column;
    }
  }
</style>
