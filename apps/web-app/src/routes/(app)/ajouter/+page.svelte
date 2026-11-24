<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";

  import type { AddResult } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  let adding = $state(false);
  let answer = $state<AddResult | null>(null);
  let undone = $state(false);
  const shown = $derived(answer ?? form?.add ?? null);
  const added = $derived(shown && "item" in shown ? shown : null);
  const addedList = $derived(added ? data.lists.find((list) => list.id === added.item.listId) : undefined);

  const errors: Record<string, string> = {
    empty: "Écrivez un lien ou quelques mots, par exemple « Livre de cuisine ».",
    not_found: "Cette liste n'existe plus. Choisissez-en une autre.",
  };
</script>

<svelte:head>
  <title>Ajouter une envie · {data.appName}</title>
</svelte:head>

<h1>Ajouter une envie</h1>

{#if added}
  <div class="card done" role="status">
    {#if undone}
      <p>L'ajout est annulé : « {added.item.title} » n'est pas dans vos listes.</p>
    {:else}
      <p>
        C'est ajouté : « {added.item.title} »{#if addedList}, dans « {addedList.name} »{/if}. Le titre et le
        prix se complètent tout seuls depuis le lien.
      </p>
    {/if}
    <p class="links">
      <a class="button" href={resolve("/(app)/listes/[id]", { id: added.item.listId })}>Voir la liste</a>
      <a class="button secondary" href={resolve("/(app)")}>Mes listes</a>
    </p>
  </div>
  {#if added.duplicate && !undone}
    <form
      method="POST"
      action="?/status"
      use:enhance={() =>
        async ({ result }) => {
          if (result.type === "success") undone = true;
        }}
      class="notice duplicate"
    >
      <p>Ce lien est déjà dans une de vos envies.</p>
      <input type="hidden" name="itemId" value={added.item.id} />
      <input type="hidden" name="status" value="archived" />
      <button type="submit" class="secondary">Annuler cet ajout</button>
    </form>
  {/if}
{:else}
  <form
    class="card"
    method="POST"
    action="?/add"
    use:enhance={() => {
      adding = true;
      return async ({ result, update }) => {
        adding = false;
        if (result.type === "success" || result.type === "failure") {
          answer = (result.data?.add as AddResult | undefined) ?? null;
        }
        await update({ reset: false });
      };
    }}
  >
    <label for="envie">Le lien, ou quelques mots</label>
    <textarea id="envie" name="input" rows="3" maxlength="4000" required aria-describedby="envie-aide"
      >{shown && "error" in shown ? shown.input : data.input}</textarea
    >
    <p id="envie-aide" class="muted help">Vous pouvez changer le texte avant d'ajouter.</p>

    {#if data.lists.length > 1}
      <label for="liste">Dans la liste</label>
      <select id="liste" name="listId">
        {#each data.lists as list (list.id)}
          <option value={list.id}>{list.name}</option>
        {/each}
      </select>
    {:else if data.lists.length === 1}
      <input type="hidden" name="listId" value={data.lists[0]?.id} />
      <p class="muted">Elle va dans « {data.lists[0]?.name} ».</p>
    {:else}
      <p class="muted">Elle va dans une nouvelle liste, « Mes envies ».</p>
    {/if}

    {#if shown && "error" in shown}
      <p class="notice error" role="alert">
        {errors[shown.error] ?? "L'ajout n'a pas abouti. Réessayez dans un instant."}
      </p>
    {/if}

    <button type="submit" class="accent add" disabled={adding} aria-busy={adding}>
      {adding ? "Ajout…" : "Ajouter à ma liste"}
    </button>
  </form>
{/if}

<style>
  textarea {
    display: block;
    width: 100%;
    resize: vertical;
    font: inherit;
    padding: 0.6rem 0.9rem;
    border: 2px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
  }
  textarea:focus-visible {
    border-color: var(--focus);
  }
  select {
    margin-bottom: 1rem;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 1rem;
  }
  .add {
    width: 100%;
    margin-top: 1rem;
    font-size: 1.15rem;
  }
  .done p {
    margin: 0 0 1rem;
  }
  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .duplicate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    margin-top: 1rem;
    border-left-color: var(--accent);
  }
  .duplicate p {
    margin: 0;
  }
</style>
