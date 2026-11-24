<script lang="ts">
  import type { Gauge } from "./view.ts";

  let { gauge, label }: { gauge: Gauge; label: string } = $props();
  const total = $derived(gauge.complete + gauge.inProgress + gauge.free);
  const W = 1000;
  const parts = $derived.by(() => {
    let at = 0;
    return (
      [
        ["complete", gauge.complete],
        ["progress", gauge.inProgress],
        ["free", gauge.free],
      ] as const
    ).map(([kind, n]) => {
      const part = { kind, x: (at / total) * W, width: (n / total) * W };
      at += n;
      return part;
    });
  });
</script>

<section class="gauge" aria-label={label}>
  <svg viewBox="0 0 {W} 16" preserveAspectRatio="none" aria-hidden="true" focusable="false">
    {#each parts as part (part.kind)}
      {#if part.width > 0}<rect class={part.kind} x={part.x} y="0" width={part.width} height="16" />{/if}
    {/each}
  </svg>
  <ul>
    <li><span class="swatch complete"></span>{gauge.complete} complet{gauge.complete > 1 ? "s" : ""}</li>
    <li><span class="swatch progress"></span>{gauge.inProgress} en cours</li>
    <li><span class="swatch free"></span>{gauge.free} libre{gauge.free > 1 ? "s" : ""}</li>
  </ul>
</section>

<style>
  .gauge {
    margin: 1rem 0 1.5rem;
  }
  svg {
    display: block;
    width: 100%;
    height: 0.75rem;
    border-radius: 999px;
    overflow: hidden;
  }
  .complete {
    fill: var(--progress);
  }
  .progress {
    fill: var(--action);
  }
  .free {
    fill: var(--border);
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1.25rem;
    font-weight: 600;
  }
  li {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }
  .swatch {
    width: 0.9rem;
    height: 0.9rem;
    border-radius: 4px;
  }
  .swatch.complete {
    background: var(--progress);
  }
  .swatch.progress {
    background: var(--action);
  }
  .swatch.free {
    background: var(--border);
    outline: 1px solid var(--text-2);
  }
</style>
