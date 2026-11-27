<script lang="ts">
  import { viewMessages } from "@wishalia/i18n/messages/view";
  import type { Snippet } from "svelte";

  import Gallery from "../Gallery.svelte";
  import Icon from "../Icon.svelte";
  import { useI18n } from "../i18n.ts";
  import type { PublicItem } from "./types.ts";
  import { availability, givers, standing } from "./view.ts";

  /**
   * A volume inside its series' card (docs/series.md), one line of the series' list: its small
   * image, its short name (« Tome 33 ») and its shop, its price, then what a guest can do with it
   * (« Offrir ») or, once given, who gives it. Its form, when open, takes the whole line under it.
   */
  let {
    item,
    label,
    children,
  }: {
    item: PublicItem;
    /** Its short name, the same from line to line; the full title stays on hover. */
    label: string;
    children?: Snippet;
  } = $props();

  const i18n = useI18n();
  const m = $derived(viewMessages(i18n.locale));
  const status = $derived(availability(item));
  const done = $derived(status === "done" || status === "received");
  const line = $derived(standing(item, i18n.locale));
  const who = $derived(item.funding ? givers(item.funding, i18n.locale) : "");

  /** Only web links become links: never a javascript: or data: address. */
  const link = $derived(item.url && /^https?:\/\//i.test(item.url) ? item.url : null);
  const site = (url: string) => URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
</script>

<li class="volume" class:done>
  <span class="thumb">
    {#if item.image}
      <Gallery title={item.title} image={item.image}>
        <img src={item.image.small} alt="" width="96" height="96" loading="lazy" decoding="async" />
      </Gallery>
    {:else}
      <span class="empty" aria-hidden="true"><Icon name="image" size="1.2rem" /></span>
    {/if}
  </span>
  <div class="name">
    <span class="title-row">
      <h3 title={label === item.title ? undefined : item.title}>
        {label}<span class="visually-hidden">{label === item.title ? "" : ` (${item.title})`}</span>
      </h3>
      {#if link}
        <!-- The site's name on a wide screen, the arrow that leaves alone on a phone; the words for a screen reader -->
        <a
          class="site"
          href={link}
          rel="noopener noreferrer nofollow external"
          target="_blank"
          aria-label={`${m.seeOn(site(link))}${m.newTab}`}
          title={m.seeOn(site(link))}
        >
          <Icon name="external" size="1.2rem" /><span class="site-name">{site(link)}</span>
        </a>
      {/if}
    </span>
    {#if item.priceCents}<span class="price under">{i18n.fmt.money(item.priceCents)}</span>{/if}
    {#if line && !done}<p class="line">{line}</p>{/if}
  </div>
  <span class="price">{item.priceCents ? i18n.fmt.money(item.priceCents) : ""}</span>
  <div class="act">
    {#if done}
      <!-- Given: a check and who gives it, in place of the button -->
      <p class="given" title={line ?? undefined}>
        <span class="check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="24" height="24" focusable="false">
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
        </span>
        <span class="who">{who || m.status[status ?? "done"]}</span>
        <span class="visually-hidden">{line ?? m.status[status ?? "done"]}</span>
      </p>
    {/if}
    {@render children?.()}
  </div>
</li>

<style>
  .volume {
    display: grid;
    grid-template-columns: 3rem minmax(0, 1fr) auto auto;
    align-items: center;
    gap: 0.5rem 0.75rem;
    padding: 0.5rem 0.75rem;
    min-height: 4rem;
  }
  .thumb,
  .thumb :global(a),
  .thumb img,
  .empty {
    display: block;
    width: 3rem;
    height: 3rem;
    border-radius: 8px;
  }
  .thumb img {
    object-fit: cover;
    background: var(--surface-2, var(--border));
  }
  .empty {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    border: 2px dashed var(--border);
    color: var(--text-2);
  }
  .done .thumb img {
    opacity: 0.6;
  }
  .name {
    min-width: 0;
  }
  .title-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0 0.75rem;
  }
  h3 {
    margin: 0;
    font-size: 1.1rem;
    line-height: 1.5rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }
  .site {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    min-height: 2.75rem;
    min-width: 2.75rem;
    max-width: 100%;
  }
  .site-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .line {
    margin: 0;
    font-size: 0.95rem;
    color: var(--text-2);
  }
  .price {
    font-weight: 700;
    white-space: nowrap;
    text-align: right;
  }
  /* On a phone, the price goes under the name (only the one shown is read) */
  .price.under {
    display: none;
  }
  .act {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 0.5rem;
    min-width: 7.5rem;
  }
  /* Nothing to do here (the owner's preview, a folded page): the price goes to the end */
  .act:empty {
    display: none;
  }
  .act > :global(*),
  .act > :global(.give) {
    margin: 0;
  }
  .given {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 2.75rem;
    color: var(--text-2);
    font-weight: 600;
    max-width: 10rem;
  }
  .who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .check svg {
    display: block;
    width: 1.4rem;
    height: 1.4rem;
    fill: none;
    stroke: var(--progress);
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  /* What only takes room when it is there (my gift and its « Retirer », a thanks, an open form): the whole line under it */
  .act:has(:global(.mine)),
  .act:has(:global(.notice)),
  .act:has(:global(details[open])) {
    grid-column: 2 / -1;
  }
  /* A phone: the shop's arrow alone, and the button a little narrower */
  @media (max-width: 30rem) {
    .volume {
      gap: 0.4rem 0.5rem;
      padding: 0.4rem 0.5rem;
    }
    .thumb,
    .thumb :global(a),
    .thumb img,
    .empty {
      width: 2.5rem;
      height: 2.5rem;
    }
    .volume {
      grid-template-columns: 2.5rem minmax(0, 1fr) auto;
    }
    .price {
      display: none;
    }
    .price.under {
      display: block;
      text-align: left;
      font-size: 0.95rem;
    }
    .title-row {
      gap: 0 0.25rem;
      flex-wrap: nowrap;
    }
    .site-name {
      display: none;
    }
    .act {
      min-width: 6.25rem;
    }
  }
</style>
