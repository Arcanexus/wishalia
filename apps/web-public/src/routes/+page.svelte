<script lang="ts">
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

<main>
  <h1>Une liste de souhaits partagée avec vous</h1>
  <p>Ouvrez le lien que l'on vous a envoyé pour voir la liste.</p>
</main>
