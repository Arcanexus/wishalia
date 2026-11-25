<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import Logo from "@wishalia/ui/Logo.svelte";
  import ModeButton from "@wishalia/ui/ModeButton.svelte";

  let { data, children } = $props();
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale));

  const section = $derived(
    page.url.pathname.startsWith("/evenements")
      ? "events"
      : page.url.pathname.startsWith("/partage")
        ? "share"
        : page.url.pathname.startsWith("/reglages")
          ? "settings"
          : "lists",
  );
</script>

<header class="top">
  <div class="bar">
    <a class="home" href={resolve("/(app)")}>
      <Logo size={36} ring={false} />
      <span>{data.appName}</span>
    </a>
    <nav aria-label={m.nav.label}>
      <a href={resolve("/(app)")} aria-current={section === "lists" ? "page" : undefined}>{m.nav.lists}</a>
      <a href={resolve("/(app)/evenements")} aria-current={section === "events" ? "page" : undefined}>
        {m.nav.events}
      </a>
      <a href={resolve("/(app)/partage")} aria-current={section === "share" ? "page" : undefined}>
        {m.nav.share}
      </a>
      <a href={resolve("/(app)/reglages")} aria-current={section === "settings" ? "page" : undefined}>
        {m.nav.settings}
      </a>
    </nav>
    <div class="tools">
      <ModeButton mode={data.mode} nextMode={data.nextMode} returnPath={page.url.pathname} />
      <form method="POST" action="/deconnexion">
        <button type="submit" class="secondary logout">
          <!-- A door and an arrow going out: alone on a phone, where the words would push it down -->
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4" />
            <path d="M15 8l4 4-4 4" />
            <path d="M19 12H9" />
          </svg>
          <span class="word">{m.nav.signOut}</span>
        </button>
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
  /* The way out stays at the top right: the links go under it when the bar is narrow */
  nav {
    order: 3;
    flex-basis: 100%;
    display: flex;
    flex-wrap: wrap;
    gap: 0 0.25rem;
  }
  @media (min-width: 62rem) {
    nav {
      order: 0;
      flex-basis: auto;
      margin-right: auto;
    }
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
    margin-left: auto;
  }
  .logout svg {
    width: 1.3rem;
    height: 1.3rem;
    flex: none;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  @media (max-width: 30rem) {
    .logout {
      width: 48px;
      padding: 0;
    }
    /* Still the button's name for a screen reader */
    .logout .word {
      position: absolute;
      width: 1px;
      height: 1px;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
    }
  }
  .page {
    max-width: 52rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }
</style>
