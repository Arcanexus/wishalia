<script lang="ts">
  import { enhance } from "$app/forms";

  import type { PublicEvent, PublicItem } from "@wishalia/ui/public/types.ts";
  import { formatEuros, giveLabel, giveError, unitsLeft } from "@wishalia/ui/public/view.ts";

  interface Values {
    amount?: string;
    units?: string;
    guestName?: string;
    message?: string;
    anonymous?: boolean;
    error?: string;
  }

  let {
    item,
    events,
    owner,
    needsName,
    guestName,
    failed = null,
  }: {
    item: PublicItem;
    /** The open events the gift can be for, on a list link. Empty on an event link. */
    events: PublicEvent[];
    owner: string;
    /** No account: the guest says who they are. */
    needsName: boolean;
    guestName: string;
    /** What was typed, when the last try for this item failed. */
    failed?: Values | null;
  } = $props();

  let sending = $state(false);
  const id = $derived(`don-${item.id}`);
  const left = $derived(unitsLeft(item));
</script>

<details class="give" open={failed !== null}>
  <summary class="button secondary">
    <span class="closed">{giveLabel(item)}</span><span class="opened">Fermer</span>
  </summary>
  <form
    method="POST"
    action="?/give"
    use:enhance={() => {
      sending = true;
      return async ({ update }) => {
        await update({ reset: false });
        sending = false;
      };
    }}
  >
    <input type="hidden" name="itemId" value={item.id} />
    {#if failed?.error}
      <p class="notice error" role="alert">{giveError(failed.error)}</p>
    {/if}

    {#if events.length === 1}
      <input type="hidden" name="eventId" value={events[0]?.id} />
    {:else if events.length > 1}
      <fieldset>
        <legend>Pour quelle occasion ?</legend>
        {#each events as event, index (event.id)}
          <label class="choice">
            <input type="radio" name="eventId" value={event.id} checked={index === 0} />
            <span>{event.name}</span>
          </label>
        {/each}
      </fieldset>
    {/if}

    {#if item.kind === "pool"}
      <label for="{id}-montant">Votre participation, en euros</label>
      <input
        id="{id}-montant"
        name="amount"
        inputmode="decimal"
        autocomplete="off"
        required
        value={failed?.amount ?? ""}
        placeholder="Par exemple 20"
        aria-describedby="{id}-montant-aide"
        aria-invalid={failed?.error === "amount_required" ? "true" : undefined}
      />
      <p id="{id}-montant-aide" class="muted help">
        {item.funding?.remainingCents
          ? `Il manque ${formatEuros(item.funding.remainingCents)}. Vous pouvez donner plus ou moins.`
          : "Le montant que vous voulez, même au-delà de l'objectif."}
      </p>
    {:else if item.kind === "quantity" && left > 1}
      <label for="{id}-nombre">Combien en offrez-vous ?</label>
      <select id="{id}-nombre" name="units">
        {#each Array.from({ length: left }, (_, index) => index + 1) as count (count)}
          <option value={count} selected={String(count) === (failed?.units ?? "1")}>{count}</option>
        {/each}
      </select>
    {/if}

    {#if needsName}
      <label for="{id}-nom">Votre prénom</label>
      <input
        id="{id}-nom"
        name="guestName"
        required
        maxlength="60"
        autocomplete="given-name"
        value={failed?.guestName ?? guestName}
        aria-describedby="{id}-nom-aide"
        aria-invalid={failed?.error === "name_required" ? "true" : undefined}
      />
      <p id="{id}-nom-aide" class="muted help">Pour que vos proches sachent qui s'en occupe.</p>
    {/if}

    <label for="{id}-mot">Un mot pour {owner} (facultatif)</label>
    <textarea id="{id}-mot" name="message" maxlength="500" rows="2" aria-describedby="{id}-mot-aide"
      >{failed?.message ?? ""}</textarea
    >
    <p id="{id}-mot-aide" class="muted help">À lire après l'occasion, avec le cadeau.</p>

    <label class="choice">
      <input type="checkbox" name="anonymous" checked={failed?.anonymous ?? false} />
      <span>
        <strong>Rester discret</strong>
        <span class="muted">Personne ne verra votre nom, pas même {owner}.</span>
      </span>
    </label>

    <button type="submit" disabled={sending}>{sending ? "Envoi…" : giveLabel(item)}</button>
  </form>
</details>

<style>
  .give {
    margin-top: 0.75rem;
  }
  summary {
    list-style: none;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .give:not([open]) summary {
    background: var(--action);
    color: var(--on-action);
    border-color: transparent;
  }
  .give[open] .closed,
  .give:not([open]) .opened {
    display: none;
  }
  form {
    border-top: 1px solid var(--border);
    margin-top: 0.75rem;
    padding-top: 0.75rem;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.35rem 0 1rem;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 1rem;
  }
  legend {
    font-weight: 600;
    margin-bottom: 0.35rem;
  }
  select {
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
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-height: 48px;
    padding: 0.5rem 0;
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
  .choice span {
    display: flex;
    flex-direction: column;
  }
  .notice {
    margin: 0 0 1rem;
  }
  button[type="submit"] {
    margin-top: 0.5rem;
  }
</style>
