<script lang="ts">
  import { enhance } from "$app/forms";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import type { EditValues, Item, List } from "./types.ts";

  /** Edits an item in place (spec §6), folded under its card until asked for. */
  let {
    item,
    lists,
    failed = null,
  }: {
    item: Item;
    lists: List[];
    /** What was typed and why it was refused, when the last try for this item failed. */
    failed?: { error: string; values: EditValues } | null;
  } = $props();

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).editor);
  /** An amount as typed back into a field: « 320 », « 12,50 ». */
  const euros = (value: number | null) => (value === null ? "" : i18n.fmt.amount(value));
  const id = $derived(`edit-${item.id}`);
  const values = $derived<EditValues>(
    failed?.values ?? {
      title: item.title,
      url: item.url ?? "",
      price: euros(item.priceCents),
      notes: item.notes ?? "",
      kind: item.kind,
      quantity: item.quantity === null ? "" : String(item.quantity),
      target: euros(item.targetCents),
      repeatable: item.repeatable,
      listId: item.listId,
    },
  );
  const invalid = (code: string) => (failed?.error === code ? "true" : undefined);
  let saving = $state(false);
</script>

<details class="edit" open={failed !== null}>
  <summary class="button secondary" aria-label={m.editLabel(item.title)}>{m.edit}</summary>
  <form
    method="POST"
    action="?/edit"
    use:enhance={() => {
      saving = true;
      return async ({ update }) => {
        await update({ reset: false });
        saving = false;
      };
    }}
  >
    <input type="hidden" name="itemId" value={item.id} />
    {#if failed}
      <p class="notice error" role="alert">
        {m.errors[failed.error] ?? m.failed}
      </p>
    {/if}

    <label for="{id}-titre">{m.name}</label>
    <input
      id="{id}-titre"
      name="title"
      required
      maxlength="300"
      value={values.title}
      aria-invalid={invalid("invalid_title")}
    />

    <fieldset class="kinds">
      <legend>{m.kindLegend}</legend>
      <label class="choice">
        <input type="radio" name="kind" value="unique" checked={values.kind === "unique"} />
        <span><strong>{m.unique.name}</strong><span class="muted">{m.unique.help}</span></span>
      </label>
      <label class="choice">
        <input type="radio" name="kind" value="quantity" checked={values.kind === "quantity"} />
        <span>
          <strong>{m.quantity.name}</strong><span class="muted">{m.quantity.help}</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="kind" value="pool" checked={values.kind === "pool"} />
        <span>
          <strong>{m.pool.name}</strong><span class="muted">{m.pool.help}</span>
        </span>
      </label>
    </fieldset>

    <!-- Shown by CSS for the kind chosen, so that it works without JavaScript too -->
    <div class="for-quantity">
      <label for="{id}-nombre">{m.howMany}</label>
      <input
        id="{id}-nombre"
        name="quantity"
        inputmode="numeric"
        autocomplete="off"
        value={values.quantity}
        aria-invalid={invalid("invalid_quantity")}
      />
    </div>
    <div class="for-pool">
      <label for="{id}-objectif">{m.target}</label>
      <input
        id="{id}-objectif"
        name="target"
        inputmode="decimal"
        autocomplete="off"
        value={values.target}
        placeholder={m.targetPlaceholder}
        aria-invalid={invalid("invalid_target")}
      />
    </div>
    <div class="for-unique">
      <label class="choice">
        <input type="checkbox" name="repeatable" checked={values.repeatable} />
        <span>
          <strong>{m.repeatable.name}</strong>
          <span class="muted">{m.repeatable.help}</span>
        </span>
      </label>
    </div>

    <div class="row">
      <div>
        <label for="{id}-prix">{m.price}</label>
        <input
          id="{id}-prix"
          name="price"
          inputmode="decimal"
          autocomplete="off"
          value={values.price}
          aria-invalid={invalid("invalid_price")}
        />
      </div>
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
    </div>

    <label for="{id}-lien">{m.link}</label>
    <input
      id="{id}-lien"
      name="url"
      type="url"
      inputmode="url"
      autocomplete="off"
      value={values.url}
      placeholder="https://…"
      aria-invalid={invalid("invalid_url")}
    />

    <label for="{id}-notes">{m.notes}</label>
    <textarea id="{id}-notes" name="notes" maxlength="4000" rows="3" aria-invalid={invalid("invalid_notes")}
      >{values.notes}</textarea
    >

    <button type="submit" disabled={saving}>{saving ? m.saving : m.save}</button>
  </form>
</details>

<style>
  .edit {
    flex-basis: 100%;
  }
  summary {
    list-style: none;
    width: fit-content;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  form {
    border-top: 1px solid var(--border);
    margin-top: 0.75rem;
    padding-top: 0.75rem;
  }
  form > input,
  form > textarea,
  form > div,
  form > fieldset {
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
  fieldset {
    border: 0;
    padding: 0;
  }
  legend {
    padding: 0;
    font-weight: 600;
    margin-bottom: 0.35rem;
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-height: 48px;
    padding: 0.35rem 0;
    font-weight: 400;
    cursor: pointer;
  }
  .choice input {
    width: 1.4rem;
    height: 1.4rem;
    min-height: 1.4rem;
    margin: 0.1rem 0 0;
    flex: none;
    accent-color: var(--action);
  }
  .choice > span {
    display: flex;
    flex-direction: column;
  }
  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0 1rem;
  }
  .row > div {
    flex: 1 1 12rem;
  }
  /* Only the fields of the kind chosen */
  .for-quantity,
  .for-pool,
  .for-unique {
    display: none;
  }
  form:has(input[name="kind"][value="quantity"]:checked) .for-quantity,
  form:has(input[name="kind"][value="pool"]:checked) .for-pool,
  form:has(input[name="kind"][value="unique"]:checked) .for-unique {
    display: block;
  }
</style>
