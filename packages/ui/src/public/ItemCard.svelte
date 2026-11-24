<script lang="ts">
  import type { Snippet } from "svelte";

  import Copies from "./Copies.svelte";
  import Givers from "./Givers.svelte";
  import PoolBar from "./PoolBar.svelte";
  import type { PublicEvent, PublicItem } from "./types.ts";
  import { formatEuros, poolBar, standing } from "./view.ts";

  /**
   * An item as the guests see it: its words, its drawing, where it stands. What a guest can do with
   * it (give, withdraw) comes as children: the owner's preview has none.
   */
  let {
    item,
    events,
    scope,
    children,
  }: { item: PublicItem; events: PublicEvent[]; scope: "list" | "event"; children?: Snippet } = $props();

  const eventsById = $derived(new Map(events.map((event) => [event.id, event])));
  const line = $derived(standing(item));
  const complete = $derived(item.status === "received" || item.funding?.state === "complete");
  const bar = $derived(item.funding && item.status !== "received" ? poolBar(item, events) : null);
  const kindLabels = { unique: null, quantity: "Plusieurs exemplaires", pool: "Cagnotte" } as const;

  /** Only web links become links: never a javascript: or data: address. */
  const webLink = (url: string | null) => (url && /^https?:\/\//i.test(url) ? url : null);
  const site = (url: string) => URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
</script>

<li class="card item" class:complete class:pictured={item.image}>
  {#if item.image}
    <!-- Next to the item's name, which says what it is: decorative for a screen reader -->
    <img
      class="picture"
      src={item.image.medium}
      alt=""
      width="480"
      height="480"
      loading="lazy"
      decoding="async"
    />
  {/if}
  <div class="content">
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
    {#if scope === "list" && item.eventIds.length > 0}
      <p class="muted small">
        Pour {item.eventIds
          .map((id) => eventsById.get(id)?.name)
          .filter(Boolean)
          .join(", ")}
      </p>
    {/if}
    {#if item.funding && item.status !== "received"}
      {#if bar}
        <PoolBar {bar} id={item.id} />
      {:else if item.kind === "quantity" && item.quantity && item.quantity <= 24}
        <Copies wanted={item.quantity} taken={item.funding.reservedUnits ?? 0} />
      {/if}
      {#if item.funding.state === "almost"}<p class="tags">
          <span class="tag almost">Presque complet</span>
        </p>{/if}
    {/if}
    {#if line}
      <div class="standing-row">
        {#if item.funding?.contributors.length}<Givers contributors={item.funding.contributors} />{/if}
        <p class="standing" class:done={complete}>{line}</p>
      </div>
    {/if}
    {@render children?.()}
  </div>
</li>

<style>
  .pictured {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: 0 1rem;
    align-items: start;
  }
  .picture {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 12px;
    background: var(--surface-2, var(--border));
  }
  @media (min-width: 40rem) {
    .pictured {
      grid-template-columns: 8rem minmax(0, 1fr);
    }
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
  .standing-row {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }
  .standing-row :global(.givers) {
    margin-top: 0;
    flex: none;
  }
  .almost {
    border-color: var(--progress);
    font-weight: 600;
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
</style>
