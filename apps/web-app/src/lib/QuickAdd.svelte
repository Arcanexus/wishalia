<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import BarcodeScan from "#lib/BarcodeScan.svelte";
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

  let field = $state<HTMLInputElement>();
  /** A scanned book: its link goes in the field, and is added at once, like a typed one. */
  const scanned = (input: string) => {
    if (!field) return;
    field.value = input;
    field.form?.requestSubmit();
  };

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).quickAdd);
</script>

<section class="quick-add card" aria-labelledby="ajout-titre">
  <h2 id="ajout-titre">{m.title}</h2>
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
    <label for="ajout">{m.label}</label>
    <div class="row">
      <input
        bind:this={field}
        id="ajout"
        name="input"
        type="text"
        enterkeyhint="send"
        autocomplete="off"
        maxlength="4000"
        placeholder={m.placeholder}
        aria-describedby="ajout-aide"
        value={shown && "error" in shown ? shown.input : ""}
      />
      <BarcodeScan onadd={scanned} />
      <button type="submit" class="accent">{m.submit}</button>
    </div>
    <p id="ajout-aide" class="muted help">
      {listName ? m.goesTo(listName) : m.goesToFirst}
      {m.autofill}
    </p>
  </form>

  {#if pending.length > 0}
    <ul class="pending" aria-busy="true">
      {#each pending as entry (entry.key)}
        <li>{entry.text} <span class="muted">· {m.adding}</span></li>
      {/each}
    </ul>
  {/if}

  <div role="status" class="feedback">
    {#if shown && "item" in shown}
      <p class="notice">
        {m.added(shown.item.title)}{#if !listName}
          · <a href={resolve("/(app)/listes/[id]", { id: shown.item.listId })}>{m.seeList}</a>{/if}.
      </p>
    {/if}
  </div>
  {#if shown && "item" in shown && shown.duplicate}
    <form method="POST" action="?/status" use:enhance class="notice duplicate">
      <p>{m.duplicate}</p>
      <input type="hidden" name="itemId" value={shown.item.id} />
      <input type="hidden" name="status" value="archived" />
      <button type="submit" class="secondary" onclick={() => (answer = null)}>{m.undo}</button>
    </form>
  {/if}
  {#if shown && "error" in shown}
    <p class="notice error" role="alert">
      {m.errors[shown.error] ?? m.failed}
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
