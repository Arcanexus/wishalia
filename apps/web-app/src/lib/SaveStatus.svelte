<script lang="ts">
  /**
   * How a form saved as it changes is doing (docs/management-app.md, « Saved as you go »): a
   * discreet line, an icon and a few words, said politely to a screen reader. On a refusal, why in
   * plain words, and « Try again »; what was typed stays in the fields.
   */
  import { appMessages } from "@wishalia/i18n/messages/app";
  import Icon from "@wishalia/ui/Icon.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import type { SaveState } from "./autosave.ts";

  let {
    state,
    error = null,
  }: {
    state: SaveState;
    /** Why the last save was refused, in words. */
    error?: string | null;
  } = $props();

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).autosave);
</script>

<div class="status" class:error={state === "error"}>
  <p role="status">
    {#if state === "saving" || state === "waiting"}
      <span class="spin" aria-hidden="true"><Icon name="reload" size="1.2rem" /></span>{m.saving}
    {:else if state === "saved"}
      <Icon name="check" size="1.2rem" />{m.saved}
    {:else if state === "error"}
      <Icon name="warning" size="1.2rem" />{error ?? m.failed}
    {/if}
  </p>
  {#if state === "error"}
    <!-- Sends the form again, at once -->
    <button type="submit" class="secondary retry"><Icon name="reload" size="1.2rem" />{m.retry}</button>
  {/if}
  <!-- Without JavaScript, nothing saves by itself: the form keeps a button -->
  <noscript><button type="submit">{m.save}</button></noscript>
</div>

<style>
  .status {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 1rem;
    min-height: 1.75rem;
  }
  p {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    margin: 0;
    color: var(--text-2);
    font-size: 0.95rem;
    font-weight: 600;
  }
  .error p {
    color: var(--text);
  }
  .error :global(svg) {
    color: var(--danger);
  }
  .retry {
    min-height: 40px;
  }
  .spin {
    display: inline-flex;
    animation: turn 1s linear infinite;
  }
  @keyframes turn {
    to {
      rotate: 360deg;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spin {
      animation: none;
    }
  }
</style>
