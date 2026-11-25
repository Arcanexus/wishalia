<script lang="ts">
  import { onMount } from "svelte";

  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { page } from "$app/state";

  import { LOCALE_NAMES, LOCALES } from "@wishalia/i18n";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import InstallApp from "#lib/InstallApp.svelte";
  import { addPasskey, deviceName, passkeysSupported, type PasskeyOutcome } from "#lib/passkey.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).settings);
  const day = (iso: string) => i18n.fmt.date(iso);
  const activeTokens = $derived(data.tokens.filter((token) => token.active));
  let copied = $state(false);

  /** null until the page runs in the browser: passkeys need JavaScript. */
  let supported = $state<boolean | null>(null);
  let adding = $state(false);
  let addOutcome = $state<PasskeyOutcome | null>(null);
  let passkeyName = $state("");
  onMount(() => {
    supported = passkeysSupported();
  });

  async function onAddPasskey(event: SubmitEvent) {
    event.preventDefault();
    adding = true;
    addOutcome = null;
    addOutcome = await addPasskey(passkeyName.trim() || deviceName(navigator.userAgent, i18n.locale));
    adding = false;
    if (addOutcome === "ok") {
      passkeyName = "";
      await invalidateAll();
    }
  }
</script>

<svelte:head>
  <title>{m.title} · {data.appName}</title>
</svelte:head>

<h1>{m.title}</h1>

<section class="card" aria-labelledby="affichage">
  <h2 id="affichage">{m.display}</h2>
  <p class="muted">{m.follows(data.me.email)}</p>
  <form
    method="POST"
    action="?/display"
    use:enhance={({ formData }) => {
      const languageChanged = formData.get("locale") !== data.me.locale;
      return async ({ result, update }) => {
        // The language is on <html lang>, written by the server: a new one needs a fresh page
        if (result.type === "success" && languageChanged) {
          window.location.reload();
          return;
        }
        await update({ reset: false });
      };
    }}
  >
    <label for="nom">{m.name}</label>
    <input
      id="nom"
      name="displayName"
      required
      maxlength="80"
      autocomplete="given-name"
      value={data.me.displayName}
      aria-describedby="nom-aide"
    />
    <p id="nom-aide" class="muted help">{m.nameHelp}</p>

    <fieldset>
      <legend>{m.theme}</legend>
      {#each ["auto", "neutral", "christmas"] as const as theme (theme)}
        <label class="choice">
          <input type="radio" name="theme" value={theme} checked={data.me.theme === theme} />
          <span>
            <strong>{m.themes[theme].name}</strong><span class="muted">{m.themes[theme].help}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>{m.mode}</legend>
      {#each ["device", "light", "dark"] as const as mode (mode)}
        <label class="choice">
          <input type="radio" name="mode" value={mode} checked={data.me.mode === mode} />
          <span><strong>{m.modes[mode]}</strong></span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>{m.language}</legend>
      <label class="choice">
        <input type="radio" name="locale" value="auto" checked={data.me.locale === "auto"} />
        <span><strong>{m.languageAuto.name}</strong><span class="muted">{m.languageAuto.help}</span></span>
      </label>
      {#each LOCALES as locale (locale)}
        <label class="choice">
          <input type="radio" name="locale" value={locale} checked={data.me.locale === locale} />
          <span><strong lang={locale}>{LOCALE_NAMES[locale]}</strong></span>
        </label>
      {/each}
    </fieldset>

    {#if form?.display && "error" in form.display}
      <p class="notice error" role="alert">{m.invalidName}</p>
    {/if}
    <div role="status">
      {#if form?.display && "saved" in form.display}<p class="notice">{m.saved}</p>{/if}
    </div>
    <button type="submit">{m.save}</button>
  </form>
</section>

<InstallApp appName={data.appName} origin={page.url.origin} />

<section class="card" aria-labelledby="cles">
  <h2 id="cles">{m.passkeys}</h2>
  <p class="muted">{m.passkeysHelp}</p>

  {#if data.passkeys.length > 0}
    <ul class="tokens passkeys">
      {#each data.passkeys as passkey (passkey.id)}
        {@const name = passkey.name ?? m.passkey}
        <li>
          <div>
            <strong>{name}</strong>
            <span class="muted">
              {passkey.createdAt ? m.addedOn(day(passkey.createdAt)) : m.added}{passkey.synced
                ? m.synced
                : m.local}
            </span>
          </div>
          <div class="row-actions">
            <details>
              <summary class="button secondary" aria-label={m.renameLabel(name)}>{m.rename}</summary>
              <form
                method="POST"
                action="?/renamePasskey"
                use:enhance={() =>
                  async ({ update }) =>
                    update({ reset: false })}
              >
                <input type="hidden" name="id" value={passkey.id} />
                <label for="cle-{passkey.id}">{m.newName}</label>
                <input id="cle-{passkey.id}" name="name" required maxlength="60" value={passkey.name ?? ""} />
                <button type="submit">{m.saveName}</button>
              </form>
            </details>
            <form method="POST" action="?/deletePasskey" use:enhance>
              <input type="hidden" name="id" value={passkey.id} />
              <input type="hidden" name="name" value={name} />
              <button type="submit" class="secondary" aria-label={m.deleteLabel(name)}>
                {m.delete}
              </button>
            </form>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <p>{m.noPasskey}</p>
  {/if}

  {#if form?.passkey && "error" in form.passkey}
    <p class="notice error" role="alert">
      {form.passkey.error === "invalid_name" ? m.passkeyInvalidName : m.passkeyFailed}
    </p>
  {/if}
  <div role="status">
    {#if form?.passkey && "renamed" in form.passkey}
      <p class="notice">{m.renamed(form.passkey.renamed)}</p>
    {:else if form?.passkey && "deleted" in form.passkey}
      <p class="notice">{m.deleted(form.passkey.deleted)}</p>
    {:else if addOutcome === "ok"}
      <p class="notice">{m.addedOk}</p>
    {:else if addOutcome === "cancelled"}
      <p class="notice">{m.addErrors.cancelled}</p>
    {/if}
  </div>

  {#if supported === false}
    <p class="notice">{m.unsupported}</p>
  {:else if supported}
    <form class="new-token" onsubmit={onAddPasskey}>
      <h3>{m.addHere}</h3>
      {#if addOutcome === "not_fresh"}
        <div class="notice error" role="alert">
          <p>{m.notFresh}</p>
        </div>
      {:else if addOutcome && addOutcome !== "ok" && addOutcome !== "cancelled"}
        <p class="notice error" role="alert">{m.addErrors[addOutcome]}</p>
      {/if}
      <label for="cle-nom">{m.passkeyName}</label>
      <input
        id="cle-nom"
        bind:value={passkeyName}
        maxlength="60"
        placeholder={m.passkeyPlaceholder}
        aria-describedby="cle-aide"
      />
      <p id="cle-aide" class="muted help">{m.passkeyAsk}</p>
      <button type="submit" disabled={adding}>{adding ? m.adding : m.add}</button>
    </form>
    {#if addOutcome === "not_fresh"}
      <form method="POST" action="/deconnexion?retour=/reglages">
        <button type="submit" class="secondary">{m.signInAgain}</button>
      </form>
    {/if}
  {/if}
</section>

{#if data.apiOrigin}
  <section class="card" aria-labelledby="jetons">
    <h2 id="jetons">{m.tokens}</h2>
    <p class="muted">{m.tokensHelp.before}<code>{data.apiOrigin}/v1</code>{m.tokensHelp.after}</p>

    {#if form?.token && "created" in form.token && form.token.created}
      {@const created = form.token.created}
      <div class="created">
        <h3>{m.tokenNamed(created.name)}</h3>
        <p role="status">{m.copyNow}</p>
        <label for="jeton" class="visually-hidden">{m.token}</label>
        <input
          id="jeton"
          type="text"
          readonly
          value={created.token}
          onfocus={(event) => event.currentTarget.select()}
        />
        <button
          type="button"
          class="accent copy"
          onclick={async () => {
            await navigator.clipboard.writeText(created.token);
            copied = true;
          }}
        >
          {copied ? m.copied : m.copy}
        </button>
      </div>
    {/if}

    {#if activeTokens.length > 0}
      <ul class="tokens">
        {#each activeTokens as token (token.id)}
          <li>
            <div>
              <strong>{token.name}</strong>
              <span class="muted">
                <code>{token.prefix}…</code>{token.readOnly ? m.readOnlyTag : ""} · {m.until(
                  day(token.expiresAt),
                )} · {token.lastUsedAt ? m.usedOn(day(token.lastUsedAt)) : m.neverUsed}
              </span>
            </div>
            <form method="POST" action="?/revokeToken" use:enhance>
              <input type="hidden" name="id" value={token.id} />
              <button type="submit" class="secondary" aria-label={m.revokeLabel(token.name)}>
                {m.revoke}
              </button>
            </form>
          </li>
        {/each}
      </ul>
    {/if}
    <div role="status" class="visually-hidden">
      {#if form?.revoke && "name" in form.revoke}{m.revoked(form.revoke.name)}{/if}
    </div>

    <form
      method="POST"
      action="?/createToken"
      class="new-token"
      use:enhance={() => {
        copied = false;
        return async ({ update }) => update();
      }}
    >
      <h3>{m.newToken}</h3>
      {#if form?.token && "error" in form.token}
        <p class="notice error" role="alert">
          {m.tokenErrors[form.token.error] ?? m.tokenFailed}
        </p>
      {/if}
      <div class="fields">
        <div>
          <label for="jeton-nom">{m.tokenName}</label>
          <input id="jeton-nom" name="name" required maxlength="60" placeholder={m.tokenPlaceholder} />
        </div>
        <div>
          <label for="jeton-jours">{m.days}</label>
          <input
            id="jeton-jours"
            name="expiresInDays"
            type="number"
            inputmode="numeric"
            min="1"
            max="365"
            value="90"
          />
        </div>
      </div>
      <label class="choice">
        <input type="checkbox" name="readOnly" />
        <span>
          <strong>{m.readOnly.name}</strong><span class="muted">{m.readOnly.help}</span>
        </span>
      </label>
      <button type="submit">{m.createToken}</button>
    </form>
  </section>
{/if}

<style>
  .card {
    margin-bottom: 1.5rem;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 1rem;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 1.25rem;
  }
  legend {
    font-weight: 600;
    margin-bottom: 0.35rem;
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-height: 48px;
    padding: 0.5rem 0;
    font-weight: 400;
    cursor: pointer;
  }
  .choice input {
    width: 1.4rem;
    height: 1.4rem;
    min-height: 1.4rem;
    margin: 0.1rem 0 0;
    flex: none;
    accent-color: var(--action);
  }
  .choice span {
    display: flex;
    flex-direction: column;
  }
  .notice {
    margin: 0 0 1rem;
  }
  code {
    overflow-wrap: anywhere;
  }
  .created {
    border: 2px solid var(--action);
    border-radius: 12px;
    padding: 1rem;
    margin-bottom: 1rem;
  }
  .created h3,
  .new-token h3 {
    font-size: 1.1rem;
  }
  .copy {
    margin-top: 0.75rem;
  }
  .tokens {
    list-style: none;
    padding: 0;
    margin: 0 0 1rem;
  }
  .tokens li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    padding: 0.75rem 0;
    border-top: 1px solid var(--border);
  }
  .tokens li div {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .passkeys li {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
  }
  /* Renaming: the field takes the whole row */
  .passkeys li .row-actions:has(details[open]) {
    grid-column: 1 / -1;
  }
  @media (max-width: 30rem) {
    .passkeys li {
      grid-template-columns: 1fr;
    }
  }
  .tokens li .row-actions {
    display: flex;
    flex-direction: row;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 0.5rem;
  }
  details[open] {
    flex-basis: 100%;
  }
  details summary {
    list-style: none;
    display: inline-flex;
  }
  details summary::-webkit-details-marker {
    display: none;
  }
  details form {
    margin-top: 0.75rem;
  }
  details form button {
    margin-top: 0.75rem;
  }
  .new-token {
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }
  .fields {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1rem;
  }
  @media (max-width: 30rem) {
    .fields {
      grid-template-columns: 1fr;
    }
  }
</style>
