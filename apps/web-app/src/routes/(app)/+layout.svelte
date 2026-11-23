<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import Logo from "#lib/Logo.svelte";

  let { data, children } = $props();

  const section = $derived(
    page.url.pathname.startsWith("/evenements")
      ? "events"
      : page.url.pathname.startsWith("/partage")
        ? "share"
        : "lists",
  );
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
      <a href={resolve("/(app)/partage")} aria-current={section === "share" ? "page" : undefined}>Partager</a>
    </nav>
    <div class="tools">
      <form method="POST" action="/preferences">
        <input type="hidden" name="retour" value={page.url.pathname} />
        <button
          type="submit"
          class="secondary"
          aria-label="Affichage {modeLabels[data.mode]}. Passer en affichage {modeLabels[data.nextMode]}"
        >
          <svg class="icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            {#if data.mode === "dark"}
              <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
            {:else if data.mode === "light"}
              <circle cx="12" cy="12" r="4.5" fill="currentColor" />
              <path
                d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            {:else}
              <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
              <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
            {/if}
          </svg>
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
    max-width: 64rem;
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
  /* Under a wide screen, the mode button keeps its symbol only; its name stays for screen readers */
  @media (max-width: 64rem) {
    .label {
      display: none;
    }
  }
</style>
