<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import ConfirmDelete from "#lib/ConfirmDelete.svelte";
  import Icon from "@wishalia/ui/Icon.svelte";
  import ListBadge from "@wishalia/ui/ListBadge.svelte";
  import IconButton from "#lib/IconButton.svelte";
  import QuickAdd from "#lib/QuickAdd.svelte";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).home);
  const removal = $derived(appMessages(i18n.locale).removal);

  const firstName = $derived(data.me.displayName.split(" ")[0] || data.me.displayName);
</script>

<svelte:head>
  <title>{m.title} · {data.appName}</title>
</svelte:head>

<h1>{m.hello(firstName)}</h1>

{#if page.url.searchParams.has("archivee")}
  <p class="notice" role="status">{m.archived}</p>
{:else if page.url.searchParams.has("supprimee")}
  <p class="notice" role="status">{m.deleted}</p>
{/if}
{#if form?.restore && "name" in form.restore}
  <p class="notice" role="status">{m.restored(form.restore.name)}</p>
{:else if form?.restore && "error" in form.restore}
  <p class="notice error" role="alert">{m.restoreFailed}</p>
{:else if form?.remove && "error" in form.remove}
  <p class="notice error" role="alert">{removal.failed}</p>
{/if}

<QuickAdd listName={data.lists[0]?.name ?? null} result={form?.add ?? null} />

<section aria-labelledby="listes-titre">
  <h2 id="listes-titre">{m.title}</h2>
  {#if data.lists.length === 0}
    <p class="muted">{m.none}</p>
  {:else}
    <ul class="lists">
      {#each data.lists as list (list.id)}
        <li>
          <a class="card list" href={resolve("/(app)/listes/[id]", { id: list.id })}>
            <ListBadge picture={list} size="medium" />
            <span class="text">
              <span class="name">{list.name}</span>
              <span class="muted">{m.count(list.itemCount)}</span>
            </span>
            <span class="go" aria-hidden="true"><Icon name="chevronRight" /></span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}

  <form method="POST" action="?/createList" use:enhance class="create">
    <label for="nouvelle-liste">{m.newList}</label>
    <div class="row">
      <input
        id="nouvelle-liste"
        name="name"
        required
        maxlength="100"
        placeholder={m.newListPlaceholder}
        value={form?.createList?.name ?? ""}
      />
      <button type="submit"><Icon name="plus" />{m.create}</button>
    </div>
    {#if form?.createList?.error}
      <p class="notice error" role="alert">{m.invalidName}</p>
    {/if}
  </form>

  <p class="import">
    {m.importQuestion}
    <a href={resolve("/(app)/importer")}>{m.importLink}</a>
  </p>
</section>

{#if data.archived.length > 0}
  <details class="archived">
    <summary>{m.archivedLists(data.archived.length)}</summary>
    <p class="muted">{m.archivedHelp}</p>
    <ul class="rows">
      {#each data.archived as list (list.id)}
        <li class="card row-item">
          <ListBadge picture={list} size="small" />
          <div class="text">
            <span class="name">{list.name}</span>
            <span class="muted">{m.count(list.itemCount)}</span>
          </div>
          <div class="buttons">
            <form method="POST" action="?/restoreList" use:enhance>
              <input type="hidden" name="listId" value={list.id} />
              <IconButton icon="restore" label={m.restore.label(list.name)} tip={m.restore.tip} />
            </form>
            <ConfirmDelete
              label={appMessages(i18n.locale).list.deleteLabel(list.name)}
              tip={appMessages(i18n.locale).list.deleteTip}
              title={removal.listTitle(list.name)}
              help={[removal.listHelp, removal.guests]}
              action="?/deleteList"
              fields={{ listId: list.id }}
            />
          </div>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .lists {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  }
  /* A card per list: its picture, its name and count, an arrow; every card the same height */
  .list {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    height: 100%;
    min-height: 5.5rem;
    padding: 1rem;
    color: var(--text);
    text-decoration: none;
  }
  .list:hover {
    border-color: var(--action);
  }
  .list:hover .name {
    text-decoration: underline;
  }
  .go {
    margin-left: auto;
    color: var(--text-2);
  }
  .name {
    overflow-wrap: anywhere;
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
  .archived {
    margin-top: 2rem;
  }
  .archived summary {
    min-height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
  }
  .rows {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }
  .row-item {
    display: flex;
    align-items: center;
    gap: 0.9rem;
    padding: 1rem;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
  }
  .buttons {
    display: flex;
    gap: 0.5rem;
  }
  @media (max-width: 30rem) {
    .row {
      flex-direction: column;
    }
  }
</style>
