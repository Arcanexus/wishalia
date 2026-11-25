<script lang="ts">
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import type { Gift } from "./types.ts";

  /** Who gave what, and the words they left: only ever given once the secret is lifted. */
  let { gifts, none }: { gifts: Gift[]; none: string } = $props();

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).gifts);
  const what = (gift: Gift) =>
    gift.amountCents !== null
      ? i18n.fmt.money(gift.amountCents)
      : gift.units !== null && gift.units > 1
        ? m.copies(gift.units)
        : m.gave;
</script>

{#if gifts.length === 0}
  <p class="muted none">{none}</p>
{:else}
  <ul class="gifts">
    {#each gifts as gift, index (index)}
      <li>
        <span><strong>{gift.name ?? m.anonymous}</strong>{m.what(what(gift))}</span>
        {#if gift.message}<blockquote>{m.quote(gift.message)}</blockquote>{/if}
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
