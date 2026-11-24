<script lang="ts">
  let { wanted, taken }: { wanted: number; taken: number } = $props();
</script>

<!-- One box per copy (spec §4); the line under it says the same in words -->
<span class="copies" aria-hidden="true">
  {#each Array.from({ length: wanted }, (_, index) => index) as index (index)}
    <span class="copy" class:taken={index < taken}></span>
  {/each}
</span>

<style>
  .copies {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin-top: 0.75rem;
  }
  .copy {
    width: 1.25rem;
    height: 1.25rem;
    border-radius: 5px;
    border: 2px solid var(--text-2);
  }
  .copy.taken {
    background: var(--progress);
    border-color: var(--progress);
  }
</style>
