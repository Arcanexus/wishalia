<script lang="ts">
  import { ICONS, type IconName } from "@wishalia/ui/icons.ts";

  /**
   * A button or a link shown as an icon alone, its words in a tip shown on hover and on keyboard
   * focus (WCAG 1.4.13: it stays while the pointer is on it, and Escape hides it). Its name is its
   * label, so a screen reader always says it.
   */
  let {
    icon,
    label,
    tip,
    href,
    onclick,
    danger = false,
    opens,
    expanded,
    controls,
  }: {
    icon: IconName;
    label: string;
    tip: string;
    href?: string | undefined;
    /**
     * Does something on the page instead of sending its form or following its link (the link stays
     * for a page without JavaScript).
     */
    onclick?: (() => void) | undefined;
    /** Drawn in the colour of danger: a deletion. */
    danger?: boolean;
    /** It opens a modal dialog. */
    opens?: "dialog" | undefined;
    /** It shows or hides a part of the page (aria-expanded), the one whose id is `controls`. */
    expanded?: boolean | undefined;
    controls?: string | undefined;
  } = $props();
  let hidden = $state(false);
  const hide = (event: KeyboardEvent) => {
    if (event.key === "Escape") hidden = true;
  };
  const show = () => (hidden = false);
</script>

<span class="wrap" class:hidden>
  {#if href}
    <!-- The caller resolves the address -->
    <!-- eslint-disable svelte/no-navigation-without-resolve -->
    <a
      class="button secondary icon"
      {href}
      aria-label={label}
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      onclick={onclick
        ? (event) => {
            event.preventDefault();
            onclick();
          }
        : undefined}
      onkeydown={hide}
      onpointerenter={show}
      onfocus={show}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        {#each ICONS[icon] as d (d)}<path {d} />{/each}
      </svg>
    </a>
    <!-- eslint-enable svelte/no-navigation-without-resolve -->
  {:else}
    <button
      type={onclick ? "button" : "submit"}
      class="secondary icon"
      class:danger
      aria-label={label}
      aria-haspopup={opens}
      aria-expanded={expanded}
      aria-controls={expanded ? controls : undefined}
      {onclick}
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
  .icon.danger {
    color: var(--danger);
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
