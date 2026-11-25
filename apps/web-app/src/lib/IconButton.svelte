<script lang="ts" module>
  /** The drawings, stroked in the colour of the text: two turning arrows, an eye, three linked dots. */
  export const ICONS = {
    reload: ["M20 12a8 8 0 1 1-2.34-5.66", "M20 4v5h-5"],
    eye: ["M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z", "M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z"],
    share: [
      "M18 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
      "M6 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
      "M18 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6z",
      "M8.6 13.5l6.8 4M15.4 6.5l-6.8 4",
    ],
    check: ["M5 12.5l4.5 4.5L19 7.5"],
  } as const;
  export type IconName = keyof typeof ICONS;
</script>

<script lang="ts">
  /**
   * A button or a link shown as an icon alone, its words in a tip shown on hover and on keyboard
   * focus (WCAG 1.4.13: it stays while the pointer is on it, and Escape hides it). Its name is its
   * label, so a screen reader always says it.
   */
  let { icon, label, tip, href }: { icon: IconName; label: string; tip: string; href?: string | undefined } =
    $props();
  let hidden = $state(false);
  const hide = (event: KeyboardEvent) => {
    if (event.key === "Escape") hidden = true;
  };
  const show = () => (hidden = false);
</script>

<span class="wrap" class:hidden>
  {#if href}
    <!-- eslint-disable-next-line svelte/no-navigation-without-resolve -- the caller resolves it -->
    <a
      class="button secondary icon"
      {href}
      aria-label={label}
      onkeydown={hide}
      onpointerenter={show}
      onfocus={show}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {#each ICONS[icon] as d (d)}<path {d} />{/each}
      </svg>
    </a>
  {:else}
    <button
      type="submit"
      class="secondary icon"
      aria-label={label}
      onkeydown={hide}
      onpointerenter={show}
      onfocus={show}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {#each ICONS[icon] as d (d)}<path {d} />{/each}
      </svg>
    </button>
  {/if}
  <span class="tip" aria-hidden="true">{tip}</span>
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
  }
  .icon {
    width: 48px;
    padding: 0;
  }
  svg {
    width: 1.4rem;
    height: 1.4rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 6px);
    /* Towards the left: these buttons sit at the right of the page, the tip never leaves it */
    right: 0;
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
  .wrap:hover .tip,
  .wrap:has(:focus-visible) .tip {
    visibility: visible;
  }
  .wrap.hidden .tip {
    visibility: hidden;
  }
</style>
