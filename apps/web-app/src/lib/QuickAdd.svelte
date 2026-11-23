<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";

  import type { AddResult } from "#lib/types.ts";

  let {
    listName = null,
    result = null,
  }: {
    /** The list the item goes to, when the page is a list; otherwise the first list. */
    listName?: string | null;
    /** The answer of a submit without JavaScript. */
    result?: AddResult | null;
  } = $props();

  // Optimistic add (spec §5.2): the item shows at once, the field is free for the next one
  let pending = $state<{ key: number; text: string }[]>([]);
  let answer = $state<AddResult | null>(null);
  let next = 0;
  const shown = $derived(answer ?? result);

  const errors: Record<string, string> = {
    empty: "Écrivez un lien ou quelques mots, par exemple « Livre de cuisine ».",
    not_found: "Cette liste n'existe plus. Rechargez la page.",
  };
</script>

<section class="quick-add card" aria-labelledby="ajout-titre">
  <h2 id="ajout-titre">Ajouter une envie</h2>
  <form
    method="POST"
    action="?/add"
    use:enhance={({ formData, formElement }) => {
      const text = String(formData.get("input") ?? "").trim();
      const key = next++;
      if (text) pending.push({ key, text });
      formElement.reset();
      answer = null;
      return async ({ result: outcome, update }) => {
        pending = pending.filter((entry) => entry.key !== key);
        if (outcome.type === "success" || outcome.type === "failure") {
          answer = (outcome.data?.add as AddResult | undefined) ?? null;
        }
        await update({ reset: false });
      };
    }}
  >
    <label for="ajout">Un lien, ou quelques mots</label>
    <div class="row">
      <input
        id="ajout"
        name="input"
        type="text"
        enterkeyhint="send"
        autocomplete="off"
        maxlength="4000"
        placeholder="https://… ou « Livre de cuisine »"
        aria-describedby="ajout-aide"
        value={shown && "error" in shown ? shown.input : ""}
      />
      <button type="submit" class="accent">Ajouter</button>
    </div>
    <p id="ajout-aide" class="muted help">
      {#if listName}Elle va dans « {listName} ».{:else}Elle va dans votre première liste.{/if}
      Le titre, l'image et le prix se complètent tout seuls depuis le lien.
    </p>
  </form>

  {#if pending.length > 0}
    <ul class="pending" aria-busy="true">
      {#each pending as entry (entry.key)}
        <li>{entry.text} <span class="muted">· ajout…</span></li>
      {/each}
    </ul>
  {/if}

  <div role="status" class="feedback">
    {#if shown && "item" in shown}
      <p class="notice">
        Ajouté : « {shown.item.title} »{#if !listName}
          · <a href={resolve("/(app)/listes/[id]", { id: shown.item.listId })}>voir la liste</a>{/if}.
      </p>
    {/if}
  </div>
  {#if shown && "item" in shown && shown.duplicate}
    <form method="POST" action="?/status" use:enhance class="notice duplicate">
      <p>Ce lien est déjà dans une de vos envies.</p>
      <input type="hidden" name="itemId" value={shown.item.id} />
      <input type="hidden" name="status" value="archived" />
      <button type="submit" class="secondary" onclick={() => (answer = null)}>Annuler cet ajout</button>
    </form>
  {/if}
  {#if shown && "error" in shown}
    <p class="notice error" role="alert">
      {errors[shown.error] ?? "L'ajout n'a pas abouti. Réessayez dans un instant."}
    </p>
  {/if}
</section>

<style>
  .quick-add {
    margin-bottom: 2rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 0;
  }
  .pending {
    list-style: none;
    padding: 0;
    margin: 1rem 0 0;
  }
  .pending li {
    padding: 0.6rem 0.9rem;
    border: 2px dashed var(--border);
    border-radius: 10px;
    margin-bottom: 0.4rem;
  }
  .feedback .notice,
  .duplicate,
  .error {
    margin: 1rem 0 0;
  }
  .duplicate {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    border-left-color: var(--accent);
  }
  .duplicate p {
    margin: 0;
  }
  @media (max-width: 30rem) {
    .row {
      flex-direction: column;
    }
  }
</style>
