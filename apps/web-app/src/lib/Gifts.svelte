<script lang="ts">
  import { cents, formatAmount } from "@wishalia/domain";

  import type { Gift } from "./types.ts";

  /** Who gave what, and the words they left: only ever given once the secret is lifted. */
  let { gifts, none }: { gifts: Gift[]; none: string } = $props();

  const what = (gift: Gift) =>
    gift.amountCents !== null
      ? formatAmount(cents(gift.amountCents))
      : gift.units !== null && gift.units > 1
        ? `${gift.units} exemplaires`
        : "l'a offert";
</script>

{#if gifts.length === 0}
  <p class="muted none">{none}</p>
{:else}
  <ul class="gifts">
    {#each gifts as gift, index (index)}
      <li>
        <span><strong>{gift.name ?? "Quelqu'un (anonyme)"}</strong> : {what(gift)}</span>
        {#if gift.message}<blockquote>« {gift.message} »</blockquote>{/if}
      </li>
    {/each}
  </ul>
{/if}

<style>
  .none {
    margin: 0.25rem 0 0;
  }
  .gifts {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;
  }
  li + li {
    margin-top: 0.35rem;
  }
  blockquote {
    margin: 0.2rem 0 0;
    padding-left: 0.75rem;
    border-left: 3px solid var(--border);
    font-style: italic;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
</style>
