<script lang="ts">
  import { viewMessages } from "@wishalia/i18n/messages/view";

  import { useI18n } from "../i18n.ts";
  import type { PoolBar } from "./view.ts";

  let { bar, id }: { bar: PoolBar; id: string } = $props();
  // SVG attributes, not inline styles: the page's CSP allows no style attribute
  const i18n = useI18n();
  const m = $derived(viewMessages(i18n.locale));
  const W = 1000;
  const x = (fraction: number) => Math.round(fraction * W * 10) / 10;
</script>

<!-- The line under the bar says it all in words: the drawing is for the eyes only -->
<svg class="bar" viewBox="0 0 {W} 24" preserveAspectRatio="none" aria-hidden="true" focusable="false">
  <defs>
    <pattern
      id="hatch-{id}"
      width="12"
      height="24"
      patternUnits="userSpaceOnUse"
      patternTransform="rotate(35)"
    >
      <rect class="hatch-back" width="12" height="24" />
      <rect class="hatch-line" width="5" height="24" />
    </pattern>
  </defs>
  <rect class="track" x="0" y="4" width={W} height="16" rx="8" />
  {#each bar.segments as segment (segment.key)}
    <rect
      class="segment tone-{segment.tone}"
      x={x(segment.start)}
      y="4"
      width={x(segment.width)}
      height="16"
    />
  {/each}
  {#if bar.overshoot}
    <rect
      x={x(bar.overshoot.start)}
      y="4"
      width={x(bar.overshoot.width)}
      height="16"
      fill="url(#hatch-{id})"
    />
  {/if}
  {#if bar.target !== null && bar.target < 1}
    <rect class="target" x={x(bar.target) - 3} y="0" width="6" height="24" />
  {/if}
</svg>

{#if bar.segments.length > 1}
  <ul class="legend">
    {#each bar.segments as segment (segment.key)}
      <li>
        <span class="swatch tone-{segment.tone}" aria-hidden="true"></span>
        {m.segment(segment.label, i18n.fmt.money(segment.cents))}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .bar {
    display: block;
    width: 100%;
    height: 1.25rem;
    margin-top: 0.75rem;
  }
  .track {
    fill: var(--border);
  }
  .segment {
    stroke: var(--surface);
    stroke-width: 4;
  }
  .tone-0 {
    fill: var(--progress);
    background: var(--progress);
  }
  .tone-1 {
    fill: var(--action);
    background: var(--action);
  }
  .tone-2 {
    fill: var(--accent);
    background: var(--accent);
  }
  .tone-3 {
    fill: var(--text-2);
    background: var(--text-2);
  }
  .hatch-back {
    fill: var(--surface);
  }
  .hatch-line {
    fill: var(--progress);
  }
  .target {
    fill: var(--text);
  }
  .legend {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    font-size: 0.95rem;
  }
  .legend li {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .swatch {
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 4px;
    flex: none;
  }
</style>
