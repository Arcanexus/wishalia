<script lang="ts">
  import { enhance } from "$app/forms";
  import { publicMessages } from "@wishalia/i18n/messages/public";
  import Icon from "@wishalia/ui/Icon.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import type { PublicEvent, PublicItem } from "@wishalia/ui/public/types.ts";
  import {
    formatEuros,
    giveLabel,
    giveError,
    priceOf,
    sharing,
    takesShares,
    unitsLeft,
  } from "@wishalia/ui/public/view.ts";

  interface Values {
    way?: string;
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
    all = null,
    short = false,
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
    /**
     * A series' volumes still to give, all at once (docs/series.md): each one bought whole, with the
     * same occasion, name and word. `item` is then the series.
     */
    all?: { ids: string[]; label: string } | null;
    /** A tile of a series' grid: « Offrir », short enough for its width. */
    short?: boolean;
  } = $props();

  const i18n = useI18n();
  const m = $derived(publicMessages(i18n.locale).give);
  let sending = $state(false);
  const id = $derived(`don-${item.id}${all ? "-tous" : ""}`);
  const left = $derived(unitsLeft(item));
  /**
   * A gift given once, with or without a price: bought whole or shared, and only shared once others
   * started. Without a price, the shares take any amount.
   */
  const shares = $derived(takesShares(item));
  const started = $derived(sharing(item));
  const partChosen = $derived(failed?.way === "part");
  const price = $derived(priceOf(item));
  const missing = $derived(price === null ? null : (item.funding?.remainingCents ?? price));
  let count = $state<HTMLInputElement>();
  /** The stepper's buttons: one more or one less, within what is left. */
  const step = (by: number) => {
    if (!count) return;
    const now = Number(count.value) || 1;
    count.value = String(Math.min(left, Math.max(1, now + by)));
  };
</script>

<details class="give" class:all open={failed !== null} data-live-hold>
  <summary class="button secondary">
    <span class="closed">
      <Icon name="gift" />{all ? all.label : short ? m.short : giveLabel(i18n.locale)}
    </span><span class="opened">{m.close}</span>
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
    {#if all}
      <input type="hidden" name="seriesId" value={item.id} />
      <input type="hidden" name="way" value="whole" />
      {#each all.ids as volumeId (volumeId)}<input type="hidden" name="itemId" value={volumeId} />{/each}
    {:else}
      <input type="hidden" name="itemId" value={item.id} />
    {/if}
    {#if failed?.error}
      <p class="notice error" role="alert">{giveError(failed.error, i18n.locale)}</p>
    {/if}

    {#if events.length === 1}
      <input type="hidden" name="eventId" value={events[0]?.id} />
    {:else if events.length > 1}
      <fieldset>
        <legend>{m.event}</legend>
        {#each events as event, index (event.id)}
          <label class="choice">
            <input type="radio" name="eventId" value={event.id} checked={index === 0} />
            <span>{event.name}</span>
          </label>
        {/each}
      </fieldset>
    {/if}

    {#if all}
      <p class="muted help">{m.allHelp}</p>
    {:else if item.kind === "pool"}
      <label for="{id}-montant">{m.amount}</label>
      <input
        id="{id}-montant"
        name="amount"
        inputmode="decimal"
        autocomplete="off"
        required
        value={failed?.amount ?? ""}
        placeholder={m.amountPlaceholder}
        aria-describedby="{id}-montant-aide"
        aria-invalid={failed?.error === "amount_required" ? "true" : undefined}
      />
      <p id="{id}-montant-aide" class="muted help">
        {item.funding?.remainingCents
          ? m.amountLeft(formatEuros(item.funding.remainingCents, i18n.locale))
          : m.amountFree}
      </p>
    {:else if shares && started}
      <input type="hidden" name="way" value="part" />
      <label for="{id}-montant">{m.amount}</label>
      <input
        id="{id}-montant"
        name="amount"
        inputmode="decimal"
        autocomplete="off"
        required
        value={failed?.amount ?? ""}
        placeholder={m.amountPlaceholder}
        aria-describedby="{id}-montant-aide"
        aria-invalid={failed?.error === "amount_required" || failed?.error === "amount_too_high"
          ? "true"
          : undefined}
      />
      <p id="{id}-montant-aide" class="muted help">
        {m.shareStarted}
        {#if missing}{m.shareLeft(formatEuros(missing, i18n.locale))}{/if}
      </p>
    {:else if shares}
      <fieldset>
        <legend>{m.way}</legend>
        <label class="choice">
          <input type="radio" name="way" value="whole" checked={!partChosen} />
          <span>
            <strong>{m.whole(price === null ? null : formatEuros(price, i18n.locale))}</strong>
            <span class="muted">{m.wholeHelp}</span>
          </span>
        </label>
        <label class="choice">
          <input type="radio" name="way" value="part" checked={partChosen} />
          <span>
            <strong>{m.part}</strong>
            <span class="muted">{price === null ? m.partHelpFree : m.partHelp}</span>
          </span>
        </label>
      </fieldset>
      <!-- Shown by CSS once « part » is chosen, so that it works without JavaScript too -->
      <div class="for-part">
        <label for="{id}-montant">{m.amount}</label>
        <input
          id="{id}-montant"
          name="amount"
          inputmode="decimal"
          autocomplete="off"
          value={failed?.amount ?? ""}
          placeholder={m.amountPlaceholder}
          aria-describedby="{id}-montant-aide"
          aria-invalid={failed?.error === "amount_required" || failed?.error === "amount_too_high"
            ? "true"
            : undefined}
        />
        <p id="{id}-montant-aide" class="muted help">
          {missing === null ? m.anyAmount : m.upTo(formatEuros(missing, i18n.locale))}
        </p>
      </div>
    {:else if item.kind === "quantity" && left > 1}
      <label for="{id}-nombre">{m.units}</label>
      <!-- A stepper: the field alone works without JavaScript -->
      <div class="stepper">
        <button
          type="button"
          class="secondary step"
          aria-label={m.fewer}
          title={m.fewer}
          onclick={() => step(-1)}
        >
          <Icon name="minus" />
        </button>
        <input
          bind:this={count}
          id="{id}-nombre"
          name="units"
          type="number"
          inputmode="numeric"
          min="1"
          max={left}
          value={failed?.units ?? "1"}
          aria-describedby="{id}-nombre-aide"
        />
        <button
          type="button"
          class="secondary step"
          aria-label={m.more}
          title={m.more}
          onclick={() => step(1)}
        >
          <Icon name="plus" />
        </button>
      </div>
      <p id="{id}-nombre-aide" class="muted help">{m.unitsLeft(left)}</p>
    {/if}

    {#if needsName}
      <label for="{id}-nom">{m.name}</label>
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
      <p id="{id}-nom-aide" class="muted help">{m.nameHelp}</p>
    {/if}

    <label for="{id}-mot">{m.message(owner)}</label>
    <textarea id="{id}-mot" name="message" maxlength="500" rows="2" aria-describedby="{id}-mot-aide"
      >{failed?.message ?? ""}</textarea
    >
    <p id="{id}-mot-aide" class="muted help">{m.messageHelp}</p>

    <label class="choice">
      <input type="checkbox" name="anonymous" checked={failed?.anonymous ?? false} />
      <span>
        <strong>{m.anonymous}</strong>
        <span class="muted">{m.anonymousHelp(owner)}</span>
      </span>
    </label>

    <button type="submit" disabled={sending}>{sending ? m.sending : m.confirm}</button>
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
  .for-part {
    display: none;
  }
  form:has(input[name="way"][value="part"]:checked) .for-part {
    display: block;
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
    padding: 0;
    font-weight: 600;
    margin-bottom: 0.35rem;
  }
  .stepper {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-top: 0.35rem;
  }
  .stepper input {
    width: 5rem;
    text-align: center;
    font-weight: 700;
  }
  .step {
    display: inline-grid;
    place-items: center;
    width: 3rem;
    min-width: 3rem;
    height: 3rem;
    padding: 0;
  }
  .closed {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
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
