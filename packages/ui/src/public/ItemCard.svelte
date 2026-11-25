<script lang="ts">
  import { viewMessages } from "@wishalia/i18n/messages/view";
  import type { Snippet } from "svelte";

  import { useI18n } from "../i18n.ts";
  import Copies from "./Copies.svelte";
  import Givers from "./Givers.svelte";
  import PoolBar from "./PoolBar.svelte";
  import type { PublicEvent, PublicItem } from "./types.ts";
  import { availability, poolBar, standing } from "./view.ts";

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

  const i18n = useI18n();
  const m = $derived(viewMessages(i18n.locale));
  const eventsById = $derived(new Map(events.map((event) => [event.id, event])));
  const line = $derived(standing(item, i18n.locale));
  const status = $derived(availability(item));
  const complete = $derived(item.status === "received" || item.funding?.state === "complete");
  const bar = $derived(
    item.funding && item.status !== "received" ? poolBar(item, events, i18n.locale) : null,
  );
  const kindLabels = $derived({ unique: null, quantity: m.kind.quantity, pool: m.kind.pool });

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
      <span class="aside">
        {#if item.kind === "pool" && item.targetCents}
          <span class="price">{i18n.fmt.money(item.targetCents)}</span>
        {:else if item.priceCents}
          <span class="price">{i18n.fmt.money(item.priceCents)}</span>
        {/if}
        {#if status}
          <!-- Where it stands, by an explicit icon (its words on hover and for a screen reader): a gift to give, half given, given, received -->
          <span class="status {status}" role="img" aria-label={m.status[status]} title={m.status[status]}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" focusable="false">
              {#if status === "free"}
                <rect x="4" y="11" width="16" height="9" rx="1.5" />
                <rect x="3" y="7.5" width="18" height="3.5" rx="1" />
                <path
                  d="M12 7.5V20M12 7.5c-1.2-3-5.5-3.6-5.5-1.4 0 1.4 3 1.4 5.5 1.4zm0 0c1.2-3 5.5-3.6 5.5-1.4 0 1.4-3 1.4-5.5 1.4z"
                />
              {:else if status === "progress"}
                <circle cx="12" cy="12" r="9" />
                <path class="fill" d="M12 3a9 9 0 0 1 0 18z" />
              {:else if status === "done"}
                <circle class="fill" cx="12" cy="12" r="10" />
                <path class="mark" d="M7.5 12.5l3 3 6-6.5" />
              {:else}
                <path
                  class="fill"
                  d="M12 20.5s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.7a4.3 4.3 0 0 1 7.5 2.8c0 5.4-7.5 10-7.5 10z"
                />
              {/if}
            </svg>
          </span>
        {/if}
      </span>
    </div>
    {#if kindLabels[item.kind] || item.repeatable || (item.kind === "quantity" && item.quantity)}
      <p class="tags">
        {#if kindLabels[item.kind]}<span class="tag">{kindLabels[item.kind]}</span>{/if}
        {#if item.kind === "quantity" && item.quantity}<span class="tag">
            {m.wanted(item.quantity)}
          </span>{/if}
        {#if item.repeatable}<span class="tag">{m.everyOccasion}</span>{/if}
      </p>
    {/if}
    {#if item.notes}<p class="notes">{item.notes}</p>{/if}
    {#if webLink(item.url)}
      {@const link = webLink(item.url) ?? ""}
      <p>
        <a href={link} rel="noopener noreferrer nofollow external" target="_blank">
          {m.seeOn(site(link))}<span class="visually-hidden">{m.newTab}</span>
        </a>
      </p>
    {/if}
    {#if scope === "list" && item.eventIds.length > 0}
      <p class="muted small">
        {m.forEvents(i18n.fmt.list(item.eventIds.flatMap((id) => eventsById.get(id)?.name ?? [])))}
      </p>
    {/if}
    {#if item.funding && item.status !== "received"}
      {#if bar}
        <PoolBar {bar} id={item.id} />
      {:else if item.kind === "quantity" && item.quantity && item.quantity <= 24}
        <Copies wanted={item.quantity} taken={item.funding.reservedUnits ?? 0} />
      {/if}
      {#if item.funding.state === "almost"}<p class="tags">
          <span class="tag almost">{m.almost}</span>
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
    line-height: 1.75rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .item p {
    margin: 0.5rem 0 0;
  }
  .head {
    display: flex;
    justify-content: space-between;
    /* The price and the badge stay on the title's first line, however long the title */
    align-items: flex-start;
    gap: 1rem;
  }
  .price {
    font-weight: 700;
    white-space: nowrap;
  }
  .aside {
    display: flex;
    align-items: center;
    min-height: 1.75rem;
    gap: 0.5rem;
    flex: none;
  }
  .status {
    display: inline-flex;
    align-self: center;
  }
  .status svg {
    display: block;
    width: 1.6rem;
    height: 1.6rem;
    fill: none;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* The colours of the event gauge; each state has its own shape too, colour is never alone */
  .status.free svg {
    stroke: var(--accent);
  }
  .status.progress svg {
    stroke: var(--action);
  }
  .status.progress .fill {
    fill: var(--action);
    stroke: none;
  }
  .status.done .fill,
  .status.received .fill {
    fill: var(--progress);
    stroke: none;
  }
  .status .mark {
    stroke: var(--surface);
    stroke-width: 2.5;
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
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 0.75rem;
    margin-top: 0.5rem;
  }
  /* The words keep a readable width: on a narrow card, the initials go on their own line */
  .item .standing-row .standing {
    flex: 1 1 9rem;
    margin: 0;
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
