<script lang="ts">
  import { page } from "$app/state";

  import Logo from "@wishalia/ui/Logo.svelte";
  import ModeButton from "@wishalia/ui/ModeButton.svelte";

  import { formatDay, formatEuros, heading, standing } from "#lib/view.ts";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
  const view = $derived(data.view);
  const owner = $derived(view.owner.displayName);
  const openEvents = $derived(view.events.filter((event) => event.open));
  const eventsById = $derived(new Map(view.events.map((event) => [event.id, event])));
  const kindLabels = { unique: null, quantity: "Plusieurs exemplaires", pool: "Cagnotte" } as const;

  /** Only web links become links: never a javascript: or data: address. */
  const webLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
  const site = (url: string) => URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
  const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
  const short = (date: string) => shortDay.format(new Date(`${date}T00:00:00Z`));
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta name="description" content={data.meta.description} />
  <meta property="og:title" content={data.meta["og:title"]} />
  <meta property="og:description" content={data.meta["og:description"]} />
  <meta property="og:type" content={data.meta["og:type"]} />
</svelte:head>

<header class="top">
  <div class="bar">
    <span class="brand"><Logo size={36} ring={false} /><span>{data.appName}</span></span>
    <ModeButton mode={data.mode} nextMode={data.nextMode} returnPath={page.url.pathname} />
  </div>
</header>

<main id="contenu" class="page">
  <p class="hello">Bonjour {view.audience} !</p>
  <h1>{heading(view)}</h1>
  <p class="muted lead">
    {#if view.event}
      Les envies de {owner}, pour le {formatDay(view.event.date)}.
    {:else}
      Les envies de {owner}.
    {/if}
  </p>

  {#if view.viewer === "owner"}
    <div class="notice owner" role="note">
      <p>
        <strong>C'est votre propre lien.</strong> Vous voyez la liste comme vos proches, mais sans rien de ce qu'ils
        vous offrent : la surprise reste entière.
      </p>
    </div>
  {:else if view.event && !view.event.open}
    <p class="notice">Cet événement est passé : la liste reste à voir, mais on ne peut plus y participer.</p>
  {:else if openEvents.length > 0 && view.scope === "list"}
    <p class="muted">
      Prochaine{openEvents.length > 1 ? "s" : ""} occasion{openEvents.length > 1 ? "s" : ""} :
      {openEvents.map((event) => `${event.name} (${short(event.date)})`).join(", ")}.
    </p>
  {/if}

  {#if view.items.length === 0}
    <p class="card empty">La liste est vide pour l'instant. Revenez un peu plus tard !</p>
  {:else}
    <ul class="items">
      {#each view.items as item (item.id)}
        {@const line = standing(item)}
        {@const complete = item.status === "received" || item.funding?.state === "complete"}
        <li class="card item" class:complete>
          <div class="head">
            <h2>{item.title}</h2>
            {#if item.kind === "pool" && item.targetCents}
              <span class="price">{formatEuros(item.targetCents)}</span>
            {:else if item.priceCents}
              <span class="price">{formatEuros(item.priceCents)}</span>
            {/if}
          </div>
          {#if kindLabels[item.kind] || item.repeatable || (item.kind === "quantity" && item.quantity)}
            <p class="tags">
              {#if kindLabels[item.kind]}<span class="tag">{kindLabels[item.kind]}</span>{/if}
              {#if item.kind === "quantity" && item.quantity}<span class="tag">
                  {item.quantity} souhaités
                </span>{/if}
              {#if item.repeatable}<span class="tag">À chaque occasion</span>{/if}
            </p>
          {/if}
          {#if item.notes}<p class="notes">{item.notes}</p>{/if}
          {#if webLink(item.url)}
            {@const link = webLink(item.url) ?? ""}
            <p>
              <a href={link} rel="noopener noreferrer nofollow external" target="_blank">
                Voir sur {site(link)}<span class="visually-hidden"> (nouvel onglet)</span>
              </a>
            </p>
          {/if}
          {#if view.scope === "list" && item.eventIds.length > 0}
            <p class="muted small">
              Pour {item.eventIds
                .map((id) => eventsById.get(id)?.name)
                .filter(Boolean)
                .join(", ")}
            </p>
          {/if}
          {#if item.kind === "pool" && item.funding && item.status !== "received"}
            <progress
              max="100"
              value={Math.round(item.funding.progress * 100)}
              aria-label="Cagnotte « {item.title} » remplie à {Math.round(item.funding.progress * 100)} %"
            ></progress>
          {/if}
          {#if line}<p class="standing" class:done={complete}>{line}</p>{/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if view.viewer !== "owner"}
    <p class="muted secret">
      Ce que vous offrez reste secret pour {owner}, jusqu'après l'occasion.
    </p>
  {/if}
</main>

<style>
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.3rem;
  }
  .page {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }
  .hello {
    font-weight: 600;
    margin: 0 0 0.25rem;
  }
  .lead {
    margin-top: 0;
  }
  .owner {
    margin-bottom: 1.5rem;
  }
  .owner p {
    margin: 0;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0;
    display: grid;
    gap: 1rem;
  }
  .item h2 {
    font-size: 1.25rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .item p {
    margin: 0.5rem 0 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
  }
  .price {
    font-weight: 700;
    white-space: nowrap;
  }
  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .tag {
    border: 1px solid var(--border);
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
    font-size: 0.9rem;
    color: var(--text-2);
  }
  .notes {
    white-space: pre-line;
  }
  .small {
    font-size: 0.95rem;
  }
  progress {
    display: block;
    width: 100%;
    height: 0.75rem;
    margin-top: 0.75rem;
    appearance: none;
    border: 0;
    border-radius: 999px;
    background: var(--border);
    overflow: hidden;
  }
  progress::-webkit-progress-bar {
    background: var(--border);
  }
  progress::-webkit-progress-value {
    background: var(--progress);
  }
  progress::-moz-progress-bar {
    background: var(--progress);
  }
  .standing {
    font-weight: 600;
  }
  /* Already given: quieter, without fading the text (contrast stays AA) */
  .complete {
    background: transparent;
    border-style: dashed;
  }
  .complete .standing {
    color: var(--text-2);
  }
  .empty {
    margin: 1.5rem 0;
  }
  .secret {
    text-align: center;
    margin-top: 2rem;
  }
</style>
