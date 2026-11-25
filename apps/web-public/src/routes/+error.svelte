<script lang="ts">
  import { page } from "$app/state";

  import { publicMessages } from "@wishalia/i18n/messages/public";
  import Logo from "@wishalia/ui/Logo.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  const i18n = useI18n();
  const m = $derived(publicMessages(i18n.locale).error);
</script>

<svelte:head>
  <title>{page.status === 404 ? m.linkTitle : m.title}</title>
</svelte:head>

<main id="contenu" class="error-page">
  <Logo size={64} />
  {#if page.status === 404}
    <h1>{m.gone}</h1>
    <p>{m.goneHelp}</p>
  {:else}
    <h1>{m.wrong}</h1>
    <p>{m.failed}</p>
  {/if}
</main>

<style>
  .error-page {
    max-width: 32rem;
    margin: 0 auto;
    padding: 3rem 1rem;
    text-align: center;
  }
</style>
