<script lang="ts">
  import { enhance } from "$app/forms";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import Icon from "@wishalia/ui/Icon.svelte";

  import IconButton from "./IconButton.svelte";

  /**
   * A bin that asks before deleting for good (docs/archive-delete.md): a modal dialog that says
   * what goes, that it cannot be undone, and that the guests are told. Cancel comes first and has
   * the focus; Escape closes it too. The server still wants the dialog's `confirm`.
   */
  let {
    label,
    tip,
    title,
    help,
    action,
    fields,
    onconfirm,
    item = false,
    undoable = false,
  }: {
    /** The bin's accessible name, with what it deletes. */
    label: string;
    tip: string;
    title: string;
    /** The paragraphs of the dialog. */
    help: string[];
    action: string;
    /** The hidden fields sent with the confirmation. */
    fields: Record<string, string>;
    /**
     * Given, the page takes the deletion over once it is confirmed: it shows it at once and saves
     * it in the background (#lib/changes.svelte.ts). Without JavaScript, the form posts as usual.
     */
    onconfirm?: () => void;
    /** Drawn as a row of a « ⋯ » menu (the bin and its words), not as an icon alone. */
    item?: boolean;
    /**
     * With `onconfirm`: no dialog, the bin deletes at once and the page offers « Annuler » for a
     * few seconds (#lib/undo.ts). The dialog stays for a deletion that cannot wait (a list).
     */
    undoable?: boolean;
  } = $props();
  const ask = () => {
    if (undoable && onconfirm) onconfirm();
    else dialog?.showModal();
  };

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).removal);
  const id = $props.id();
  let dialog = $state<HTMLDialogElement>();
  let busy = $state(false);
  /** Moves the dialog to the end of the page, out of a « ⋯ » menu that closes. */
  const onBody = (node: HTMLDialogElement) => {
    if (item) document.body.append(node);
    return { destroy: () => node.remove() };
  };
</script>

{#if item}
  <button
    type="button"
    class="menu-item danger-item"
    aria-label={label}
    aria-haspopup={undoable ? undefined : "dialog"}
    onclick={ask}
  >
    <Icon name="trash" />{tip}
  </button>
{:else}
  <IconButton icon="trash" {label} {tip} danger opens={undoable ? undefined : "dialog"} onclick={ask} />
{/if}

<!-- On the page's body: a menu that folds back never hides it -->
{#if !undoable}
  <dialog
    bind:this={dialog}
    use:onBody
    class="confirm"
    aria-labelledby="{id}-titre"
    aria-describedby="{id}-aide"
  >
    <h2 id="{id}-titre">{title}</h2>
    <div id="{id}-aide">
      {#each help as paragraph (paragraph)}<p>{paragraph}</p>{/each}
    </div>
    <form
      method="POST"
      {action}
      use:enhance={({ cancel }) => {
        if (onconfirm) {
          // Gone at once: the dialog closes and the page saves it behind
          cancel();
          dialog?.close();
          onconfirm();
          return;
        }
        busy = true;
        return async ({ update }) => {
          dialog?.close();
          busy = false;
          await update();
        };
      }}
    >
      {#each Object.entries(fields) as [name, value] (name)}<input type="hidden" {name} {value} />{/each}
      <input type="hidden" name="confirm" value="oui" />
      <div class="buttons">
        <button type="button" class="secondary" onclick={() => dialog?.close()}>{m.cancel}</button>
        <button type="submit" class="danger" disabled={busy}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16" /><path d="M10 11v6M14 11v6" /><path d="M6 7l1 13h10l1-13" /><path
              d="M9 7V4h6v3"
            />
          </svg>
          {m.confirm}
        </button>
      </div>
    </form>
  </dialog>
{/if}

<style>
  .confirm {
    width: min(32rem, calc(100vw - 2rem));
    padding: 1.5rem;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    color: var(--text);
  }
  .confirm::backdrop {
    background: rgb(0 0 0 / 0.55);
  }
  h2 {
    margin: 0 0 0.75rem;
    font-size: 1.3rem;
  }
  p {
    margin: 0 0 0.75rem;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }
  .danger-item {
    color: var(--danger) !important;
  }
  .danger {
    background: var(--danger);
    color: var(--surface);
  }
  svg {
    width: 1.3rem;
    height: 1.3rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @media (max-width: 30rem) {
    .buttons {
      flex-direction: column;
    }
    .buttons button {
      width: 100%;
    }
  }
</style>
