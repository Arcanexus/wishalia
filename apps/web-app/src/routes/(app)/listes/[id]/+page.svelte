<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { cents, formatAmount } from "@wishalia/domain";

  import Gifts from "#lib/Gifts.svelte";
  import ItemEditor from "#lib/ItemEditor.svelte";
  import ListSettings from "#lib/ListSettings.svelte";
  import QuickAdd from "#lib/QuickAdd.svelte";
  import type { Item } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const open = $derived(data.items.filter((item) => item.status === "open"));
  const closed = $derived(data.items.filter((item) => item.status !== "open"));

  /** Only web links become links: never a javascript: or data: address from an old item. */
  const webLink = (item: Item) => (item.url && /^https?:\/\//i.test(item.url) ? item.url : null);
  const kindLine = (item: Item) =>
    item.kind === "pool"
      ? item.targetCents
        ? `Cagnotte, objectif ${formatAmount(cents(item.targetCents)).replace(/,00(?=\s*€)/u, "")}`
        : "Cagnotte"
      : item.kind === "quantity"
        ? `${item.quantity ?? 1} exemplaire${(item.quantity ?? 1) > 1 ? "s" : ""}`
        : item.repeatable
          ? "À chaque occasion"
          : null;
  const failedEdit = (item: Item) =>
    form?.edit && "error" in form.edit && form.edit.itemId === item.id
      ? { error: form.edit.error, values: form.edit.values }
      : null;
  const host = (url: string) => URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
</script>

<svelte:head>
  <title>{data.list.name} · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)")}>← Mes listes</a></p>
<div class="heading">
  <h1>{data.list.name}</h1>
  <div class="actions">
    <a class="button secondary" href={resolve("/(app)/listes/[id]/apercu", { id: data.list.id })}>Aperçu</a>
    <a class="button secondary" href="{resolve('/(app)/partage')}?liste={data.list.id}">
      Partager cette liste
    </a>
  </div>
</div>

<ListSettings list={data.list} {form} />

<QuickAdd listName={data.list.name} result={form?.add ?? null} />

<div role="status" class="visually-hidden">
  {#if form?.settings && "saved" in form.settings}
    Réglages de la liste enregistrés.
  {:else if form?.reveal && "lifted" in form.reveal}
    Le secret de la liste est levé.
  {:else if form?.edit && "title" in form.edit}
    « {form.edit.title} » est enregistré{form.edit.listId !== data.list.id ? " et a changé de liste" : ""}.
  {:else if form?.status && "status" in form.status}
    « {form.status.title} » : {form.status.status === "received"
      ? "reçu"
      : form.status.status === "archived"
        ? "archivé"
        : "remis dans la liste"}.
  {/if}
</div>

<section aria-labelledby="envies-titre">
  <h2 id="envies-titre">Envies ({open.length})</h2>
  {#if open.length === 0}
    <p class="muted">Aucune envie pour le moment. Ajoutez-en une ci-dessus.</p>
  {:else}
    <ul class="items">
      {#each open as item (item.id)}
        {@const link = webLink(item)}
        <li class="card item">
          <div class="text">
            <h3>{item.title}</h3>
            <p class="muted meta">
              {#if kindLine(item)}<span class="kind">{kindLine(item)}</span>{/if}
              {#if item.priceCents !== null}<span>{formatAmount(cents(item.priceCents))}</span>{/if}
              {#if link}
                <a href={link} rel="noopener noreferrer external" target="_blank">
                  {host(link)}<span class="visually-hidden"> (nouvel onglet)</span>
                </a>
              {/if}
            </p>
            {#if item.notes}<p class="notes">{item.notes}</p>{/if}
            {#if data.gifts[item.id]?.length}<Gifts gifts={data.gifts[item.id] ?? []} none="" />{/if}
          </div>
          <div class="actions">
            <form method="POST" action="?/status" use:enhance>
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit" name="status" value="received" aria-label="J'ai reçu « {item.title} »">
                Reçu
              </button>
            </form>
            <form method="POST" action="?/status" use:enhance>
              <input type="hidden" name="itemId" value={item.id} />
              <button
                type="submit"
                name="status"
                value="archived"
                class="secondary"
                aria-label="Archiver « {item.title} »"
              >
                Archiver
              </button>
            </form>
          </div>
          <ItemEditor {item} lists={data.lists} failed={failedEdit(item)} />
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if closed.length > 0}
  <details class="closed">
    <summary>Reçues et archivées ({closed.length})</summary>
    <ul class="items">
      {#each closed as item (item.id)}
        <li class="card item">
          <div class="text">
            <h3>{item.title}</h3>
            <p class="muted meta">{item.status === "received" ? "Reçu" : "Archivé"}</p>
            {#if data.gifts[item.id]}
              <Gifts
                gifts={data.gifts[item.id] ?? []}
                none="Personne ne l'a offert en dehors des événements."
              />
            {/if}
          </div>
          <form method="POST" action="?/status" use:enhance class="actions">
            <input type="hidden" name="itemId" value={item.id} />
            <button
              type="submit"
              name="status"
              value="open"
              class="secondary"
              aria-label="Remettre « {item.title} » dans la liste"
            >
              Remettre dans la liste
            </button>
          </form>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
  }
  .heading h1 {
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .back {
    margin: 0 0 0.5rem;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }
  .item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .text {
    flex: 1 1 16rem;
    min-width: 0;
  }
  h3 {
    font-size: 1.15rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0.25rem 0 0;
  }
  .kind {
    color: var(--text);
    font-weight: 600;
  }
  .notes {
    margin: 0.5rem 0 0;
    white-space: pre-line;
  }
  .actions {
    display: flex;
    gap: 0.5rem;
  }
  .closed {
    margin-top: 2rem;
  }
  summary {
    min-height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
  }
  .closed .items {
    margin-top: 0.75rem;
  }
</style>
