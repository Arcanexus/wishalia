<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { cents, formatAmount } from "@wishalia/domain";

  import QuickAdd from "#lib/QuickAdd.svelte";
  import type { Item } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const open = $derived(data.items.filter((item) => item.status === "open"));
  const closed = $derived(data.items.filter((item) => item.status !== "open"));

  /** Only web links become links: never a javascript: or data: address from an old item. */
  const webLink = (item: Item) => (item.url && /^https?:\/\//i.test(item.url) ? item.url : null);
  const host = (url: string) => URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
</script>

<svelte:head>
  <title>{data.list.name} · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)")}>← Mes listes</a></p>
<h1>{data.list.name}</h1>

<QuickAdd listName={data.list.name} result={form?.add ?? null} />

<div role="status" class="visually-hidden">
  {#if form?.status && "status" in form.status}
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
              {#if item.priceCents !== null}<span>{formatAmount(cents(item.priceCents))}</span>{/if}
              {#if link}
                <a href={link} rel="noopener noreferrer external" target="_blank">
                  {host(link)}<span class="visually-hidden"> (nouvel onglet)</span>
                </a>
              {/if}
            </p>
            {#if item.notes}<p class="notes">{item.notes}</p>{/if}
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
