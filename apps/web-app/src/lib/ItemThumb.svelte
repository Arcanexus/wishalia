<script lang="ts">
  /**
   * An item's square, always there so that every card lines up (docs/management-app.md, « Item
   * cards »): its image, which opens big; while the link is read, a place that breathes; without
   * one, an empty frame. With images on, a small pencil over its corner changes or adds them, as
   * the count of images sits over the other corner.
   */
  import { resolve } from "$app/paths";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import Gallery from "@wishalia/ui/Gallery.svelte";
  import Icon from "@wishalia/ui/Icon.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import type { Item } from "./types.ts";

  let {
    item,
    listId,
    images,
    small = false,
  }: {
    item: Item;
    listId: string;
    /** Whether this instance keeps images (IMAGE_STORAGE): without, no pencil. */
    images: boolean;
    /** The smaller square of a received or archived item. */
    small?: boolean;
  } = $props();

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).list);
  const waiting = $derived(!item.image && images && item.enrichment === "pending");
  let hidden = $state(false);
</script>

<div class="thumb" class:small>
  {#if item.image}
    <!-- The link that opens it big carries the words: the thumbnail itself is decorative -->
    <Gallery title={item.title} image={item.image} class="thumb-frame">
      <img src={item.image.small} alt="" width="192" height="192" loading="lazy" decoding="async" />
    </Gallery>
  {:else if waiting}
    <!-- Its image may come with the link: a place kept for it, that breathes while it waits -->
    <span class="thumb-frame empty waiting" aria-hidden="true"><Icon name="image" /></span>
  {:else}
    <span class="thumb-frame empty" aria-hidden="true"><Icon name="image" /></span>
  {/if}
  {#if images && !small}
    {@const words = item.image ? m.imageEdit : m.imageAdd}
    <span class="edit" class:hidden>
      <a
        href={resolve("/(app)/listes/[id]/image/[itemId]", { id: listId, itemId: item.id })}
        aria-label={words.label(item.title)}
        onkeydown={(event) => (hidden = event.key === "Escape")}
        onpointerenter={() => (hidden = false)}
        onfocus={() => (hidden = false)}
      >
        <Icon name={item.image ? "pencil" : "plus"} size="1rem" />
      </a>
      <span class="tip" aria-hidden="true">{words.tip}</span>
    </span>
  {/if}
</div>

<style>
  .thumb {
    position: relative;
    grid-area: thumb;
    width: 4.5rem;
    height: 4.5rem;
  }
  @media (min-width: 40rem) {
    .thumb {
      width: 6rem;
      height: 6rem;
    }
  }
  .thumb.small {
    width: 3.5rem;
    height: 3.5rem;
  }
  .thumb :global(.thumb-frame),
  .thumb img {
    display: block;
    width: 100%;
    height: 100%;
    border-radius: 12px;
  }
  .thumb .empty {
    display: grid;
  }
  img {
    object-fit: cover;
    background: var(--border);
  }
  .empty {
    display: grid;
    place-items: center;
    border: 2px dashed var(--border);
    color: var(--text-2);
  }
  .waiting {
    border-color: var(--progress);
    animation: breathe 1.4s ease-in-out infinite;
  }
  @keyframes breathe {
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .waiting {
      animation: none;
    }
  }
  /* The pencil over the top corner, the count of images keeps the bottom one */
  .edit {
    position: absolute;
    top: -0.4rem;
    right: -0.4rem;
    z-index: 1;
  }
  .edit a {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--surface);
    color: var(--text);
    border: 2px solid var(--border);
    box-shadow: 0 1px 4px rgb(0 0 0 / 0.15);
  }
  .edit a:hover {
    border-color: var(--action);
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 2;
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    background: var(--text);
    color: var(--surface);
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    visibility: hidden;
    pointer-events: none;
  }
  .edit:hover .tip,
  .edit:has(:focus-visible) .tip {
    visibility: visible;
  }
  .edit.hidden .tip {
    visibility: hidden;
  }
</style>
