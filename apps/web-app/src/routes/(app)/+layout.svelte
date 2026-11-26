<script lang="ts">
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import Logo from "@wishalia/ui/Logo.svelte";
  import { commonMessages } from "@wishalia/i18n/messages/common";
  import DisplayMenu from "@wishalia/ui/DisplayMenu.svelte";
  import Icon from "@wishalia/ui/Icon.svelte";
  import Menu from "@wishalia/ui/Menu.svelte";

  let { data, children } = $props();
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale));
  const account = $derived(commonMessages(i18n.locale).account);
  /** The first letter of the person's name, in the account's round icon. */
  const initial = $derived(data.me.displayName.trim().charAt(0).toLocaleUpperCase(i18n.locale) || undefined);

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
    </nav>
    <!-- At the top right: the display, then the account (docs/management-app.md, « Header ») -->
    <div class="tools">
      <DisplayMenu mode={data.mode} theme={data.me.theme} returnPath={page.url.pathname + page.url.search} />
      <Menu icon="user" label={account.menu(data.me.displayName)} {initial}>
        <p class="menu-who">
          <strong>{data.me.displayName}</strong>
          <span class="muted">{data.me.email}</span>
        </p>
        <a
          class="menu-item"
          href={resolve("/(app)/reglages")}
          aria-current={section === "settings" ? "page" : undefined}
        >
          <Icon name="settings" />{account.settings}
        </a>
        <form method="POST" action="/deconnexion">
          <button type="submit" class="menu-item"><Icon name="signOut" />{account.signOut}</button>
        </form>
      </Menu>
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
  @media (min-width: 44rem) {
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
    align-items: center;
    gap: 0.5rem;
    margin-left: auto;
  }
  .page {
    max-width: 52rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }
</style>
