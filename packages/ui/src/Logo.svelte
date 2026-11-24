<script lang="ts">
  /** The logo (docs/branding.md): five relatives in a circle around a gift, in the theme's colours. */
  let { size = 40, ring = true }: { size?: number; ring?: boolean } = $props();
</script>

<svg viewBox="0 0 96 96" width={size} height={size} aria-hidden="true" focusable="false">
  {#if ring}
    <circle cx="48" cy="48" r="36" fill="none" stroke="var(--logo-ring)" stroke-width="3" />
  {/if}
  <g fill="var(--logo-heads)">
    <circle cx="48" cy="12" r="8" />
    <circle cx="82.2" cy="36.9" r="8" />
    <circle cx="69.2" cy="77.1" r="8" />
    <circle cx="26.8" cy="77.1" r="8" />
    <circle cx="13.8" cy="36.9" r="8" />
  </g>
  <g fill="var(--logo-gift)">
    <rect x="32" y="41" width="32" height="9" rx="3" />
    <rect x="35" y="52" width="26" height="18" rx="3" />
    <circle cx="43" cy="36" r="4" />
    <circle cx="53" cy="36" r="4" />
  </g>
  <rect x="45" y="41" width="6" height="29" fill="var(--logo-ribbon)" />
</svg>
