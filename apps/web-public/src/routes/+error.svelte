<script lang="ts">
  import { page } from "$app/state";

  import Logo from "@wishalia/ui/Logo.svelte";
</script>

<svelte:head>
  <title>{page.status === 404 ? "Lien introuvable" : "Erreur"}</title>
</svelte:head>

<main id="contenu" class="error-page">
  <Logo size={64} />
  {#if page.status === 404}
    <h1>Ce lien ne fonctionne plus</h1>
    <p>
      Il a peut-être été remplacé, ou il est arrivé à sa date de fin. Demandez un nouveau lien à la personne
      qui vous l'a envoyé.
    </p>
  {:else}
    <h1>Quelque chose s'est mal passé</h1>
    <p>La liste n'a pas pu s'afficher. Réessayez dans un instant.</p>
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
