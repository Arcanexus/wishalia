<script lang="ts">
  /**
   * Where the completion of an item from its link stands, as a drawing that says it
   * (docs/live-updates.md): a chain link while the page is read, a picture while its images come,
   * a warning when the link cannot be read. A ring turns around the first two (and stays still with
   * reduced motion). Decorative: the words next to it say the same to a screen reader.
   */
  let { stage }: { stage: "reading" | "images" | "failed" } = $props();

  const GLYPHS = {
    reading: [
      "M10 13.5a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66l-1.06 1.06",
      "M14 10.5a4 4 0 0 0-5.66 0l-2.83 2.83a4 4 0 0 0 5.66 5.66l1.06-1.06",
    ],
    images: ["M5 6h14v12H5z", "M5 16l4-4 3 3 2-2 5 5", "M15 9.5a1 1 0 1 0 0 .01"],
    failed: ["M12 4l9 16H3z", "M12 10v4", "M12 17v.01"],
  } as const;
</script>

<span class="stage" class:live={stage !== "failed"} aria-hidden="true">
  {#if stage !== "failed"}
    <svg class="ring" viewBox="0 0 32 32" width="32" height="32">
      <circle class="track" cx="16" cy="16" r="14" fill="none" stroke-width="2.5" />
      <path class="arc" d="M16 2a14 14 0 0 1 14 14" fill="none" stroke-width="2.5" stroke-linecap="round" />
    </svg>
  {/if}
  <svg class="glyph" viewBox="0 0 24 24" width="18" height="18">
    {#each GLYPHS[stage] as d (d)}<path {d} />{/each}
  </svg>
</span>

<style>
  .stage {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
    width: 32px;
    height: 32px;
  }
  .ring,
  .glyph {
    grid-area: 1 / 1;
  }
  .ring {
    animation: turn 0.9s linear infinite;
  }
  .track {
    stroke: var(--border);
  }
  .arc {
    stroke: var(--progress, var(--accent));
  }
  .glyph {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .ring {
      animation: none;
    }
  }
</style>
