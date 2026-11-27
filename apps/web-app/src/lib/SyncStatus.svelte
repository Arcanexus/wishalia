<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import Icon from "@wishalia/ui/Icon.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import { changes } from "./changes.svelte.ts";
  import IconButton from "./IconButton.svelte";

  /**
   * Where the changes saved in the background stand (docs/management-app.md, « Saved in the
   * background »), in the header: nothing when all is saved; a cloud with an arrow while they go;
   * a crossed-out cloud, that tries again when tapped, while they wait for the network; a line
   * when one was refused or the session ended. Said politely to a screen reader, never by
   * moving the focus.
   */
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).sync);
  const state = changes.state;
  // The ones still to send (the sent ones only wait for the page to load again)
  const count = $derived(state.changes.length);
  // One refused: named; several: said together
  const refusedTitle = $derived(state.refused.length === 1 ? (state.refused[0]?.title ?? "") : "");
</script>

<div class="sync">
  {#if state.signedOut}
    <a class="line" href="{resolve('/connexion')}?retour={encodeURIComponent(page.url.pathname)}">
      <Icon name="cloudOff" />{m.signIn}
    </a>
  {:else if state.waiting && count > 0}
    <IconButton
      icon="cloudOff"
      label={m.waiting(count)}
      tip="{m.waiting(count)} {m.waitingTip}"
      below
      onclick={() => changes.wake()}
    />
  {:else if count > 0}
    <span class="saving" title={m.savingTip}>
      <Icon name="cloudUp" />
      <span class="visually-hidden">{m.saving(count)} {m.savingTip}</span>
    </span>
  {/if}
</div>
<!-- Polite: what happens with the changes, without taking the focus -->
<div role="status" class="visually-hidden">
  {#if state.signedOut}{m.signedOut}{:else if state.waiting && count > 0}{m.waiting(count)}{/if}
</div>
{#if state.refused.length > 0}
  <div class="refused" role="alert">
    <Icon name="warning" />
    <p>{m.refused(refusedTitle)}</p>
    <IconButton icon="close" label={m.dismiss} tip={m.dismiss} onclick={() => changes.dismiss()} />
  </div>
{/if}

<style>
  .sync {
    display: flex;
    align-items: center;
  }
  .saving {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    min-height: 44px;
    color: var(--text-2);
  }
  .line {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    min-height: 44px;
    font-weight: 600;
  }
  .refused {
    position: fixed;
    inset: auto 1rem 1rem 1rem;
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 0.75rem;
    max-width: 40rem;
    margin: 0 auto;
    padding: 0.5rem 0.5rem 0.5rem 1rem;
    border: 1px solid var(--danger);
    border-radius: 12px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.2);
  }
  .refused p {
    flex: 1;
    margin: 0;
  }
</style>
