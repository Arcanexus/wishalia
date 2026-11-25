<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { commonMessages } from "@wishalia/i18n/messages/common";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import Logo from "@wishalia/ui/Logo.svelte";

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).error);
  const common = $derived(commonMessages(i18n.locale).error);
</script>

<svelte:head>
  <title>{page.status === 404 ? common.title.notFound : common.title.other}</title>
</svelte:head>

<main id="contenu" class="error-page">
  <Logo size={64} />
  <h1>{page.status === 404 ? m.notFound : common.somethingWrong}</h1>
  <p>
    {page.status === 404 ? (page.error?.message ?? m.missing) : m.retry}
  </p>
  <a class="button" href={resolve("/(app)")}>{m.back}</a>
</main>

<style>
  .error-page {
    max-width: 32rem;
    margin: 0 auto;
    padding: 3rem 1rem;
    text-align: center;
  }
</style>
