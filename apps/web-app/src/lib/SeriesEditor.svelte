<script lang="ts">
  import { untrack } from "svelte";
  import { applyAction } from "$app/forms";
  import { invalidate } from "$app/navigation";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import { autosave, type SaveState } from "./autosave.ts";
  import IconButton from "./IconButton.svelte";
  import SaveStatus from "./SaveStatus.svelte";
  import type { EditValues, Item, List } from "./types.ts";

  /**
   * Edits a series in place (docs/series.md): its name, its notes, its list. Prices, links and
   * images belong to its volumes, each edited under its own pencil. Saved as it changes.
   */
  let {
    series,
    lists,
    failed = null,
    onclose,
  }: {
    series: Item;
    lists: List[];
    failed?: { error: string; values: EditValues } | null;
    onclose: () => void;
  } = $props();

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).editor);
  const s = $derived(appMessages(i18n.locale).series);
  const id = $derived(`edit-${series.id}`);
  const values = untrack(() => ({
    title: failed?.values.title ?? series.title,
    notes: failed?.values.notes ?? series.notes ?? "",
    listId: failed?.values.listId ?? series.listId,
  }));
  let error = $state<string | null>(untrack(() => failed?.error ?? null));
  let saveState = $state<SaveState>(untrack(() => (failed ? "error" : "idle")));
  const headingId = $derived(`${id}-titre-editeur`);
</script>

<section class="edit" {id} aria-labelledby={headingId} data-live-hold>
  <div class="top">
    <h4 id={headingId}>{s.edit.label(series.title)}</h4>
    <IconButton icon="close" label={m.close} tip={m.close} onclick={onclose} />
  </div>
  <form
    method="POST"
    action="?/edit"
    use:autosave={{
      onState: (state) => (saveState = state),
      onResult: async (result) => {
        if (result.type === "success") {
          error = null;
          const moved = (result.data?.edit as { listId?: string } | undefined)?.listId !== series.listId;
          if (moved) await applyAction(result);
          await invalidate("wishalia:list");
          return true;
        }
        error =
          result.type === "failure" ? String((result.data?.edit as { error?: string })?.error ?? "") : "";
        return false;
      },
    }}
  >
    <input type="hidden" name="itemId" value={series.id} />
    <input type="hidden" name="kind" value="series" />
    <input type="hidden" name="series" value="1" />

    <label for="{id}-titre">{s.name}</label>
    <input
      id="{id}-titre"
      name="title"
      required
      maxlength="300"
      value={values.title}
      aria-invalid={error === "invalid_title" ? "true" : undefined}
    />

    {#if lists.length > 1}
      <div>
        <label for="{id}-liste">{m.list}</label>
        <select id="{id}-liste" name="listId">
          {#each lists as list (list.id)}
            <option value={list.id} selected={values.listId === list.id}>{list.name}</option>
          {/each}
        </select>
      </div>
    {/if}

    <label for="{id}-notes">{s.notes}</label>
    <textarea
      id="{id}-notes"
      name="notes"
      maxlength="4000"
      rows="2"
      aria-describedby="{id}-notes-aide"
      aria-invalid={error === "invalid_notes" ? "true" : undefined}>{values.notes}</textarea
    >
    <p id="{id}-notes-aide" class="muted help">{s.notesHelp}</p>

    <SaveStatus state={saveState} error={error ? (m.errors[error] ?? m.failed) : null} />
  </form>
</section>

<style>
  .edit {
    grid-area: editor;
    border-top: 1px solid var(--border);
    margin-top: 0.25rem;
    padding-top: 0.75rem;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.5rem;
  }
  h4 {
    margin: 0;
    font-size: 1.05rem;
    overflow-wrap: anywhere;
  }
  form > input,
  form > div {
    margin-bottom: 1rem;
  }
  textarea {
    display: block;
    width: 100%;
    font: inherit;
    padding: 0.6rem 0.9rem;
    border: 2px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
  }
  textarea:focus-visible {
    border-color: var(--focus);
  }
  .help {
    font-size: 0.95rem;
    margin: 0.35rem 0 1rem;
  }
</style>
