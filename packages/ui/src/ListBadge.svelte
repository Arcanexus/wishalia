<script lang="ts">
  import { listPicture } from "@wishalia/domain";

  import { LIST_ICON_DRAWINGS } from "./list-icons.ts";

  /**
   * The picture of a list, next to its name (docs/list-pictures.md): the image its owner sent,
   * squared, or its icon drawn in the theme's colours. Always the same rounded square, so that the
   * names line up whatever each list shows. Decorative: the name next to it says what it is.
   */
  let {
    picture,
    size = "medium",
  }: {
    picture: { icon?: string | null; image?: { small: string; medium: string } | null };
    /** 40 px in a row, 56 px on a card or a page's title, 72 px in the picker. */
    size?: "small" | "medium" | "large";
  } = $props();

  // Only the signed thumbnails of this host: a picture never sends the browser elsewhere
  const signed = (path: string) => path.startsWith("/img/");
  const shown = $derived(
    listPicture({
      icon: picture.icon ?? null,
      image:
        picture.image && signed(picture.image.small) && signed(picture.image.medium) ? picture.image : null,
    }),
  );
</script>

<span class="badge {size}" aria-hidden="true">
  {#if shown.kind === "image"}
    <img
      src={size === "large" ? shown.image.medium : shown.image.small}
      alt=""
      loading="lazy"
      decoding="async"
    />
  {:else}
    <svg viewBox="0 0 24 24">
      {#each LIST_ICON_DRAWINGS[shown.icon] as [tone, d], index (index)}<path class={tone} {d} />{/each}
    </svg>
  {/if}
</span>

<style>
  .badge {
    display: inline-grid;
    place-items: center;
    flex: none;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--bg);
  }
  .small {
    width: 40px;
    height: 40px;
    border-radius: 10px;
  }
  .medium {
    width: 56px;
    height: 56px;
  }
  .large {
    width: 72px;
    height: 72px;
    border-radius: 16px;
  }
  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  svg {
    width: 62%;
    height: 62%;
    fill: none;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .line {
    stroke: var(--logo-heads);
  }
  .accent {
    stroke: var(--logo-gift);
  }
  .gold {
    stroke: var(--logo-ribbon);
  }
</style>
