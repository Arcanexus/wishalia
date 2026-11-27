<script lang="ts">
  import { appMessages } from "@wishalia/i18n/messages/app";
  import Icon from "@wishalia/ui/Icon.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import { deletions } from "./undo.svelte.ts";

  /**
   * « « Lampe » est supprimée. Annuler »: the message of a held deletion (#lib/undo.ts), at the
   * foot of the screen. Its time stops while it is pointed at or focused; « Annuler » brings the
   * wish back, and a screen reader hears both.
   */
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).removal.undo);
  const held = $derived(deletions.state.held);
</script>

<div class="visually-hidden" role="status">
  {#if held}{m.done(held.change.title ?? "")}{:else}{deletions.state.back}{/if}
</div>
{#if held}
  <!-- Its words are said by the status above: the bar itself is for the eyes and the button -->
  <div
    class="toast"
    role="group"
    aria-label={m.label}
    onpointerenter={() => deletions.pause()}
    onpointerleave={() => deletions.resume()}
    onfocusin={() => deletions.pause()}
    onfocusout={() => deletions.resume()}
  >
    <Icon name="trash" />
    <p aria-hidden="true">{m.done(held.change.title ?? "")}</p>
    <button
      type="button"
      class="secondary"
      aria-label={m.undoLabel(held.change.title ?? "")}
      onclick={() => deletions.undo(m.back)}
    >
      <Icon name="restore" />{m.undo}
    </button>
  </div>
{/if}

<style>
  .toast {
    position: fixed;
    z-index: 30;
    left: 50%;
    bottom: max(1rem, env(safe-area-inset-bottom));
    transform: translateX(-50%);
    width: min(32rem, calc(100vw - 2rem));
    box-sizing: border-box;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 0.6rem 0.6rem 1rem;
    border-radius: 14px;
    background: var(--text);
    color: var(--surface);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
  }
  p {
    flex: 1;
    margin: 0;
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  button {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    flex: none;
    min-height: 48px;
    background: var(--surface);
    color: var(--text);
    border-color: var(--surface);
  }
</style>
