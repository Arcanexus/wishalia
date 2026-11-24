<script lang="ts">
  import { enhance } from "$app/forms";
  import { cents, formatAmount } from "@wishalia/domain";

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

  const messages: Record<string, string> = {
    invalid_title: "Donnez un nom à l'envie.",
    invalid_url: "Le lien doit être une adresse web, qui commence par https://.",
    invalid_notes: "Les notes font 4 000 caractères au plus.",
    invalid_price: "Le prix est un montant en euros, par exemple 24 ou 12,50.",
    invalid_quantity: "Indiquez combien d'exemplaires vous souhaitez, de 1 à 1 000.",
    invalid_target: "L'objectif est un montant en euros, par exemple 320.",
    not_found: "Cette envie n'existe plus.",
  };
  /** An amount as typed back into a field: « 320 », « 12,50 ». */
  const euros = (value: number | null) =>
    value === null ? "" : formatAmount(cents(value)).replace(/\s*€$/u, "").replace(/,00$/u, "");
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
  <summary class="button secondary" aria-label="Modifier « {item.title} »">Modifier</summary>
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
        {messages[failed.error] ?? "L'enregistrement n'a pas abouti. Réessayez dans un instant."}
      </p>
    {/if}

    <label for="{id}-titre">Nom</label>
    <input
      id="{id}-titre"
      name="title"
      required
      maxlength="300"
      value={values.title}
      aria-invalid={invalid("invalid_title")}
    />

    <fieldset class="kinds">
      <legend>Quel genre de cadeau ?</legend>
      <label class="choice">
        <input type="radio" name="kind" value="unique" checked={values.kind === "unique"} />
        <span><strong>Un cadeau</strong><span class="muted">Une personne le réserve.</span></span>
      </label>
      <label class="choice">
        <input type="radio" name="kind" value="quantity" checked={values.kind === "quantity"} />
        <span>
          <strong>Plusieurs exemplaires</strong><span class="muted">Chacun en réserve un ou plusieurs.</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="kind" value="pool" checked={values.kind === "pool"} />
        <span>
          <strong>Une cagnotte</strong><span class="muted">Chacun participe du montant qu'il veut.</span>
        </span>
      </label>
    </fieldset>

    <!-- Shown by CSS for the kind chosen, so that it works without JavaScript too -->
    <div class="for-quantity">
      <label for="{id}-nombre">Combien d'exemplaires ?</label>
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
      <label for="{id}-objectif">Objectif de la cagnotte, en euros (facultatif)</label>
      <input
        id="{id}-objectif"
        name="target"
        inputmode="decimal"
        autocomplete="off"
        value={values.target}
        placeholder="Par exemple 320"
        aria-invalid={invalid("invalid_target")}
      />
    </div>
    <div class="for-unique">
      <label class="choice">
        <input type="checkbox" name="repeatable" checked={values.repeatable} />
        <span>
          <strong>À chaque occasion</strong>
          <span class="muted">On peut l'offrir encore et encore, comme un bon chocolat chaud.</span>
        </span>
      </label>
    </div>

    <div class="row">
      <div>
        <label for="{id}-prix">Prix, en euros (facultatif)</label>
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
          <label for="{id}-liste">Liste</label>
          <select id="{id}-liste" name="listId">
            {#each lists as list (list.id)}
              <option value={list.id} selected={values.listId === list.id}>{list.name}</option>
            {/each}
          </select>
        </div>
      {/if}
    </div>

    <label for="{id}-lien">Lien (facultatif)</label>
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

    <label for="{id}-notes">Notes pour vos proches (facultatif)</label>
    <textarea id="{id}-notes" name="notes" maxlength="4000" rows="3" aria-invalid={invalid("invalid_notes")}
      >{values.notes}</textarea
    >

    <button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer"}</button>
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
