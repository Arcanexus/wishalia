<script lang="ts">
  /** A link of the header bar shown as an icon, its words as its name and in a tip (WCAG 1.4.13). */
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons.ts";

  let { icon, label, href }: { icon: IconName; label: string; href: string } = $props();
  let hidden = $state(false);
</script>

<span class="wrap" class:hidden>
  <!-- An address on the other host, given whole by the caller -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    class="button secondary"
    {href}
    rel="external"
    aria-label={label}
    onkeydown={(event) => (hidden = event.key === "Escape")}
    onpointerenter={() => (hidden = false)}
    onfocus={() => (hidden = false)}
  >
    <Icon name={icon} />
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
  <span class="tip" aria-hidden="true">{label}</span>
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
  }
  a {
    width: 48px;
    padding: 0;
  }
  .tip {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 3;
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
