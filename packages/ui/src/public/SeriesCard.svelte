<script lang="ts">
  import { viewMessages } from "@wishalia/i18n/messages/view";
  import { volumeLabel, volumeNumber } from "@wishalia/domain";
  import type { Snippet } from "svelte";

  import Gallery from "../Gallery.svelte";
  import Icon from "../Icon.svelte";
  import { useI18n } from "../i18n.ts";
  import Copies from "./Copies.svelte";
  import VolumeRow from "./VolumeRow.svelte";
  import type { PublicEvent, PublicItem } from "./types.ts";
  import { cardPrice, seriesLeft } from "./view.ts";

  /**
   * A series as the guests see it (docs/series.md): one card, like a gift wanted in several copies,
   * with its volumes inside, each one with its own price, link, image and button. What a guest can
   * do with a volume comes from the page (`volume`): the owner's preview has none.
   */
  let {
    series,
    volumes,
    events,
    scope,
    volume,
    all,
  }: {
    series: PublicItem;
    volumes: PublicItem[];
    events: PublicEvent[];
    scope: "list" | "event";
    volume?: Snippet<[PublicItem]>;
    /** What a guest can do with the whole series (« Offrir les N tomes restants »), under the tiles. */
    all?: Snippet<[PublicItem]>;
  } = $props();

  const i18n = useI18n();
  const m = $derived(viewMessages(i18n.locale));
  const eventsById = $derived(new Map(events.map((event) => [event.id, event])));
  const left = $derived(seriesLeft(volumes));
  const complete = $derived(left !== null && left.left === 0);
  // Its own image, or the first volume's: the square is never empty when a volume has one
  const image = $derived(series.image ?? volumes.find((entry) => entry.image)?.image ?? null);
  // What the volumes still to give cost together, once guests may see what is given
  const leftCents = $derived(left && left.left > 0 ? cardPrice(series, volumes) : null);
  const headingId = $derived(`serie-${series.id}`);
  /**
   * A volume's name on its line, the same from line to line: « Tome 33 », from the number in its
   * title; without a number, its title without the series' name in front.
   */
  const short = (title: string) => {
    const n = volumeNumber(title);
    return n ? m.series.volume(n) : volumeLabel(title, series.title);
  };
</script>

<li class="card item series" class:complete aria-labelledby={headingId}>
  <div class="head-row">
    {#if image}
      <Gallery title={series.title} {image}>
        <img
          class="picture"
          src={image.medium}
          alt=""
          width="480"
          height="480"
          loading="lazy"
          decoding="async"
        />
      </Gallery>
    {:else}
      <span class="picture empty" aria-hidden="true"><Icon name="series" /></span>
    {/if}
    <div class="content">
      <div class="title-row">
        <h2 id={headingId}>{series.title}</h2>
        {#if leftCents}<span class="price">{m.series.leftPrice(i18n.fmt.money(leftCents))}</span>{/if}
      </div>
      <p class="tags">
        <span class="tag with-icon"><Icon name="series" size="1rem" />{m.kind.series}</span>
      </p>
      {#if series.notes}<p class="notes">{series.notes}</p>{/if}
      {#if scope === "list" && series.eventIds.length > 0}
        <p class="muted small">
          {m.forEvents(i18n.fmt.list(series.eventIds.flatMap((id) => eventsById.get(id)?.name ?? [])))}
        </p>
      {/if}
      {#if left}
        {#if left.total <= 24}
          <!-- One box per volume, as for a gift wanted in several copies, and « 2 sur 5 offerts » beside them -->
          <div class="boxes">
            <Copies wanted={left.total} taken={left.total - left.left} />
            <p class="standing" class:done={complete}>{m.series.given(left.total - left.left, left.total)}</p>
          </div>
        {:else}
          <p class="standing" class:done={complete}>{m.series.left(left.left, left.total)}</p>
        {/if}
      {/if}
    </div>
  </div>
  {#if volumes.length > 0}
    <!-- Open for a short series; folded for a long one, its summary saying how many volumes -->
    <details class="fold" open={volumes.length <= 10}>
      <summary>
        <Icon name="chevronRight" size="1.2rem" />{m.series.volumes(volumes.length)}
      </summary>
      <ul class="volumes" aria-label={m.series.listLabel(series.title)}>
        {#each volumes as entry (entry.id)}
          <VolumeRow item={entry} label={short(entry.title)}>
            {@render volume?.(entry)}
          </VolumeRow>
        {/each}
      </ul>
      {@render all?.(series)}
    </details>
  {/if}
</li>

<style>
  .head-row {
    display: grid;
    grid-template-columns: 5.5rem minmax(0, 1fr);
    gap: 0 1rem;
    align-items: start;
  }
  @media (min-width: 40rem) {
    .head-row {
      grid-template-columns: 8rem minmax(0, 1fr);
    }
  }
  .picture {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 12px;
    background: var(--surface-2, var(--border));
  }
  .empty {
    display: grid;
    place-items: center;
    box-sizing: border-box;
    background: transparent;
    border: 2px dashed var(--border);
    color: var(--text-2);
  }
  h2 {
    font-size: 1.25rem;
    line-height: 1.75rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .content p {
    margin: 0.5rem 0 0;
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
  .with-icon {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
  }
  .notes {
    white-space: pre-line;
  }
  .small {
    font-size: 0.95rem;
  }
  .standing {
    font-weight: 600;
  }
  .standing.done {
    color: var(--text-2);
  }
  .fold {
    margin-top: 0.75rem;
    border-top: 1px solid var(--border);
  }
  .fold summary {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    cursor: pointer;
    font-weight: 600;
    list-style: none;
  }
  .fold summary::-webkit-details-marker {
    display: none;
  }
  .fold summary :global(.icon) {
    transition: transform 0.15s ease;
  }
  .fold[open] summary :global(.icon) {
    transform: rotate(90deg);
  }
  @media (prefers-reduced-motion: reduce) {
    .fold summary :global(.icon) {
      transition: none;
    }
  }
  /* The volumes as a list, one line each, inside a frame */
  .volumes {
    list-style: none;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border);
    border-radius: 12px;
  }
  .volumes > :global(li + li) {
    border-top: 1px solid var(--border);
  }
  .fold > :global(:last-child:not(.volumes)) {
    margin-top: 1rem;
  }
  .title-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.25rem 1rem;
    flex-wrap: wrap;
  }
  .price {
    font-weight: 700;
    white-space: nowrap;
  }
  .boxes {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 0.25rem 0.75rem;
    margin-top: 0.5rem;
  }
  .boxes > :global(*) {
    margin: 0 !important;
  }
  .complete {
    background: transparent;
    border-style: dashed;
  }
</style>
