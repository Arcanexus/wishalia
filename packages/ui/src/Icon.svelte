<script lang="ts">
  /** One of the shared icons (icons.ts), decorative: whatever carries it says its words. */
  import { ICONS, type IconName } from "./icons.ts";

  let { name, size = "1.4rem" }: { name: IconName; size?: "1rem" | "1.2rem" | "1.4rem" | "2rem" } = $props();
</script>

<svg
  class="icon"
  class:s10={size === "1rem"}
  class:s12={size === "1.2rem"}
  class:s20={size === "2rem"}
  viewBox="0 0 24 24"
  aria-hidden="true"
  focusable="false"
>
  {#each ICONS[name] as d (d)}<path {d} />{/each}
</svg>

<style>
  /* Sizes as classes: the CSP (style-src 'self') refuses style attributes */
  .icon {
    flex: none;
    width: 1.4rem;
    height: 1.4rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.25;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .s10 {
    width: 1rem;
    height: 1rem;
  }
  .s12 {
    width: 1.2rem;
    height: 1.2rem;
  }
  .s20 {
    width: 2rem;
    height: 2rem;
    stroke-width: 1.75;
  }
</style>
