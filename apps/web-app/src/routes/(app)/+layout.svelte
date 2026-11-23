<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import Logo from "#lib/Logo.svelte";

  let { data, children } = $props();

  const section = $derived(page.url.pathname.startsWith("/evenements") ? "events" : "lists");
  const modeLabels = { device: "comme l'appareil", light: "clair", dark: "sombre" } as const;
</script>

<header class="top">
  <div class="bar">
    <a class="home" href={resolve("/(app)")}>
      <Logo size={36} ring={false} />
      <span>{data.appName}</span>
    </a>
    <nav aria-label="Principale">
      <a href={resolve("/(app)")} aria-current={section === "lists" ? "page" : undefined}>Mes listes</a>
      <a href={resolve("/(app)/evenements")} aria-current={section === "events" ? "page" : undefined}>
        Événements
      </a>
    </nav>
    <div class="tools">
      <form method="POST" action="/preferences">
        <input type="hidden" name="retour" value={page.url.pathname} />
        <button
          type="submit"
          class="secondary"
          aria-label="Affichage {modeLabels[data.mode]}. Passer en affichage {modeLabels[data.nextMode]}"
        >
          <span aria-hidden="true">{data.mode === "dark" ? "☾" : data.mode === "light" ? "☀" : "◐"}</span>
          <span class="label">Affichage {modeLabels[data.mode]}</span>
        </button>
      </form>
      <form method="POST" action="/deconnexion">
        <button type="submit" class="secondary">Se déconnecter</button>
      </form>
    </div>
  </div>
</header>

<main id="contenu" class="page">
  {@render children()}
</main>

<style>
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar {
    max-width: 52rem;
    margin: 0 auto;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    flex-wrap: wrap;
  }
  .home {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    min-height: 48px;
    color: var(--text);
    text-decoration: none;
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.3rem;
  }
  nav {
    display: flex;
    gap: 0.25rem;
    margin-right: auto;
  }
  nav a {
    display: inline-flex;
    align-items: center;
    min-height: 48px;
    padding: 0 0.75rem;
    border-radius: 10px;
    color: var(--text);
    font-weight: 600;
    text-decoration: none;
  }
  nav a:hover {
    text-decoration: underline;
  }
  nav a[aria-current="page"] {
    box-shadow: inset 0 -3px 0 var(--action);
    border-radius: 0;
  }
  .tools {
    display: flex;
    gap: 0.5rem;
  }
  .page {
    max-width: 52rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }
  /* On a phone, the mode button keeps its symbol only; its name stays for screen readers */
  @media (max-width: 30rem) {
    .label {
      display: none;
    }
  }
</style>
