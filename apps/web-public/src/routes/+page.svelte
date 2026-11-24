<script lang="ts">
  import Logo from "@wishalia/ui/Logo.svelte";

  import type { PageProps } from "./$types";

  let { data }: PageProps = $props();
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta name="description" content={data.meta.description} />
  <meta property="og:title" content={data.meta["og:title"]} />
  <meta property="og:description" content={data.meta["og:description"]} />
  <meta property="og:type" content={data.meta["og:type"]} />
</svelte:head>

<main id="contenu" class="home">
  <Logo size={72} />
  <h1>Une liste de souhaits partagée avec vous</h1>
  <p>Ouvrez le lien que l'on vous a envoyé pour voir la liste.</p>
</main>

<style>
  .home {
    max-width: 32rem;
    margin: 0 auto;
    padding: 3rem 1rem;
    text-align: center;
  }
</style>
