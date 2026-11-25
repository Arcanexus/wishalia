<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import type { AddResult } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  let adding = $state(false);
  let answer = $state<AddResult | null>(null);
  let undone = $state(false);
  const shown = $derived(answer ?? form?.add ?? null);
  const added = $derived(shown && "item" in shown ? shown : null);
  const addedList = $derived(added ? data.lists.find((list) => list.id === added.item.listId) : undefined);

  const i18n = useI18n();
  const all = $derived(appMessages(i18n.locale));
  const m = $derived(all.add);
</script>

<svelte:head>
  <title>{m.title} · {data.appName}</title>
</svelte:head>

<h1>{m.title}</h1>

{#if added}
  <div class="card done" role="status">
    {#if undone}
      <p>{m.undone(added.item.title)}</p>
    {:else}
      <p>{m.added(added.item.title, addedList?.name ?? null)}</p>
    {/if}
    <p class="links">
      <a class="button" href={resolve("/(app)/listes/[id]", { id: added.item.listId })}>{m.seeList}</a>
      <a class="button secondary" href={resolve("/(app)")}>{m.myLists}</a>
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
      <p>{all.quickAdd.duplicate}</p>
      <input type="hidden" name="itemId" value={added.item.id} />
      <input type="hidden" name="status" value="archived" />
      <button type="submit" class="secondary">{all.quickAdd.undo}</button>
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
    <label for="envie">{m.label}</label>
    <textarea id="envie" name="input" rows="3" maxlength="4000" required aria-describedby="envie-aide"
      >{shown && "error" in shown ? shown.input : data.input}</textarea
    >
    <p id="envie-aide" class="muted help">{m.help}</p>

    {#if data.lists.length > 1}
      <label for="liste">{m.list}</label>
      <select id="liste" name="listId">
        {#each data.lists as list (list.id)}
          <option value={list.id}>{list.name}</option>
        {/each}
      </select>
    {:else if data.lists.length === 1}
      <input type="hidden" name="listId" value={data.lists[0]?.id} />
      <p class="muted">{m.goesTo(data.lists[0]?.name ?? "")}</p>
    {:else}
      <p class="muted">{m.goesToNew}</p>
    {/if}

    {#if shown && "error" in shown}
      <p class="notice error" role="alert">
        {m.errors[shown.error] ?? all.quickAdd.failed}
      </p>
    {/if}

    <button type="submit" class="accent add" disabled={adding} aria-busy={adding}>
      {adding ? m.adding : m.submit}
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
