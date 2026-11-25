<script lang="ts">
  import { useI18n } from "../i18n.ts";
  import type { Funding } from "./types.ts";
  import { initials } from "./view.ts";

  let { contributors }: { contributors: Funding["contributors"] } = $props();
  const i18n = useI18n();
  const MAX = 5;
  const shown = $derived(contributors.slice(0, MAX));
</script>

<!-- Stacked avatars (spec §4); the names are in the line next to them -->
<span class="givers" aria-hidden="true">
  {#each shown as contributor, index (index)}
    <span class="avatar" class:discreet={!contributor.name}>{initials(contributor.name, i18n.locale)}</span>
  {/each}
  {#if contributors.length > MAX}<span class="avatar more">+{contributors.length - MAX}</span>{/if}
</span>

<style>
  .givers {
    display: inline-flex;
    margin-top: 0.75rem;
  }
  .avatar {
    display: inline-grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--action);
    color: var(--on-action);
    border: 2px solid var(--surface);
    font-size: 0.8rem;
    font-weight: 700;
  }
  .avatar + .avatar {
    margin-left: -0.5rem;
  }
  .discreet,
  .more {
    background: var(--border);
    color: var(--text);
  }
</style>
