<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import Logo from "@wishalia/ui/Logo.svelte";
</script>

<svelte:head>
  <title>{page.status === 404 ? "Introuvable" : "Erreur"}</title>
</svelte:head>

<main id="contenu" class="error-page">
  <Logo size={64} />
  <h1>{page.status === 404 ? "Page introuvable" : "Quelque chose s'est mal passé"}</h1>
  <p>
    {page.status === 404
      ? (page.error?.message ?? "Cette page n'existe pas.")
      : "Réessayez dans un instant. Si cela continue, prévenez la personne qui gère l'application."}
  </p>
  <a class="button" href={resolve("/(app)")}>Revenir à mes listes</a>
</main>

<style>
  .error-page {
    max-width: 32rem;
    margin: 0 auto;
    padding: 3rem 1rem;
    text-align: center;
  }
</style>
