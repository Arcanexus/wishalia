<script lang="ts">
  /**
   * « Recharger »: an icon alone, its words in a tip shown on hover and on keyboard focus (WCAG
   * 1.4.13: it stays while the pointer is on it, and Escape hides it). The button's name is its
   * label, so a screen reader always says it.
   */
  let { label, tip }: { label: string; tip: string } = $props();
  let hidden = $state(false);
</script>

<span class="wrap" class:hidden>
  <button
    type="submit"
    class="secondary icon"
    aria-label={label}
    onkeydown={(event) => {
      if (event.key === "Escape") hidden = true;
    }}
    onpointerenter={() => (hidden = false)}
    onfocus={() => (hidden = false)}
  >
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.34-5.66" /><path d="M20 4v5h-5" />
    </svg>
  </button>
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
    left: 50%;
    translate: -50% 0;
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
