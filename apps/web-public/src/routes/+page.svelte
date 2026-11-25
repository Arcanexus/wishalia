<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import { publicMessages } from "@wishalia/i18n/messages/public";
  import LanguageButtons from "@wishalia/ui/LanguageButtons.svelte";
  import Logo from "@wishalia/ui/Logo.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import ModeButton from "@wishalia/ui/ModeButton.svelte";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const home = $derived(data.home);
  const searched = $derived(data.searched !== "");
  const i18n = useI18n();
  const m = $derived(publicMessages(i18n.locale).home);
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta name="description" content={data.meta.description} />
  <meta property="og:title" content={data.meta["og:title"]} />
  <meta property="og:description" content={data.meta["og:description"]} />
  <meta property="og:type" content={data.meta["og:type"]} />
</svelte:head>

<header class="top">
  <div class="bar">
    <span class="brand"><Logo size={36} ring={false} /><span>{data.appName}</span></span>
    <div class="tools">
      <LanguageButtons returnPath={page.url.pathname} />
      <ModeButton mode={data.mode} nextMode={data.nextMode} returnPath={page.url.pathname} />
      {#if home.me && data.appUrl}
        <a class="button secondary" href={data.appUrl} rel="external">{m.myLists}</a>
      {:else if data.signInUrl}
        <a class="button secondary" href={data.signInUrl} rel="external">{m.signIn}</a>
      {/if}
    </div>
  </div>
</header>

<main id="contenu" class="page">
  <section class="hero" aria-labelledby="titre">
    <Logo size={96} />
    <h1 id="titre">{m.title}</h1>
    <p class="lead">{m.lead}</p>
    {#if home.me}
      <p class="hello">{m.hello(home.me.displayName)}</p>
    {/if}
  </section>

  <div class="ways">
    <section class="card way" aria-labelledby="lien-titre">
      <h2 id="lien-titre">{m.gotLink}</h2>
      <p>{m.gotLinkHelp}</p>
      <form method="POST" action="?/open" use:enhance>
        <label for="lien">{m.link}</label>
        <input
          id="lien"
          name="link"
          type="text"
          inputmode="url"
          autocomplete="off"
          spellcheck="false"
          placeholder="https://…/s/…"
          maxlength="500"
          required
          value={form?.open?.link ?? ""}
          aria-invalid={form?.open?.error ? "true" : undefined}
          aria-describedby={form?.open?.error ? "lien-erreur" : undefined}
        />
        {#if form?.open?.error}
          <p id="lien-erreur" class="notice error" role="alert">{m.noLink}</p>
        {/if}
        <button type="submit">{m.open}</button>
      </form>
    </section>

    <section class="card way" aria-labelledby="compte-titre">
      <h2 id="compte-titre">{home.me ? m.yourLists : m.account}</h2>
      {#if home.me}
        <p>{m.yourListsHelp}</p>
        {#if data.appUrl}<a class="button" href={data.appUrl} rel="external">{m.openLists}</a>{/if}
      {:else}
        <p>{m.accountHelp}</p>
        {#if data.signInUrl}<a class="button" href={data.signInUrl} rel="external">{m.signIn}</a>{/if}
      {/if}
    </section>
  </div>

  <section class="find" aria-labelledby="trouver-titre">
    <h2 id="trouver-titre">{m.find}</h2>
    <p class="muted">{m.findHelp}</p>
    <form method="GET" action="/" role="search" class="search">
      <label for="recherche">{m.search}</label>
      <div class="row">
        <input
          id="recherche"
          name="q"
          type="search"
          maxlength="80"
          value={data.searched}
          autocomplete="off"
        />
        <button type="submit">{m.searchButton}</button>
      </div>
    </form>

    <div class="results" aria-live="polite">
      {#if home.lists.length === 0}
        <p class="card empty">
          {searched ? m.noMatch(data.searched) : m.noPublic}
        </p>
      {:else}
        <p class="muted count">
          {searched ? m.results(home.lists.length, home.more, data.searched) : m.latest}
        </p>
        <ul class="lists">
          {#each home.lists as list (list.path)}
            <li class="card list">
              <div>
                <h3>{list.name}</h3>
                <p class="muted">{m.wishesOf(list.ownerName)} · {m.wishes(list.itemCount)}</p>
              </div>
              <a
                class="button"
                href={resolve("/s/[token]", { token: list.path.slice("/s/".length) })}
                aria-label={m.seeLabel(list.name, list.ownerName)}
              >
                {m.see}
              </a>
            </li>
          {/each}
        </ul>
        {#if home.more}
          <p class="muted">{m.more}</p>
        {/if}
      {/if}
    </div>
  </section>
</main>

<style>
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar {
    max-width: 60rem;
    margin: 0 auto;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.3rem;
  }
  .tools {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }
  .tools .button {
    white-space: nowrap;
    padding: 0 0.9rem;
  }
  .page {
    max-width: 60rem;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }
  .hero {
    text-align: center;
    max-width: 40rem;
    margin: 0 auto 2rem;
  }
  .hero h1 {
    margin: 0.75rem 0 0.5rem;
    font-size: clamp(1.6rem, 4vw, 2.3rem);
  }
  .lead {
    font-size: 1.1rem;
    margin: 0;
  }
  .hello {
    font-weight: 600;
    margin: 1rem 0 0;
  }
  .ways {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
    gap: 1rem;
    margin-bottom: 2.5rem;
  }
  .way {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }
  .way h2 {
    margin-top: 0;
  }
  .way p {
    margin-top: 0;
  }
  .way form {
    width: 100%;
  }
  .way input {
    margin-bottom: 0.75rem;
  }
  .way .notice {
    margin: 0 0 0.75rem;
  }
  .way > .button {
    margin-top: auto;
  }
  .search {
    margin: 1rem 0 1.5rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  .count {
    margin: 0 0 0.75rem;
  }
  .lists {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
    display: grid;
    gap: 0.75rem;
  }
  .list {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem 1rem;
  }
  .list h3 {
    margin: 0 0 0.25rem;
  }
  .list p {
    margin: 0;
  }
  .empty {
    margin: 0;
  }
  @media (max-width: 30rem) {
    .row {
      flex-direction: column;
    }
    .list .button {
      width: 100%;
    }
  }
</style>
