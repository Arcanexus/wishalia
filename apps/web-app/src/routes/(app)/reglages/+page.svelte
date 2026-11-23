<script lang="ts">
  import { enhance } from "$app/forms";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const themes = [
    {
      value: "auto",
      label: "Automatique",
      help: "Noël en décembre et pour les listes de Noël, neutre le reste de l'année.",
    },
    { value: "neutral", label: "Neutre", help: "Ardoise, grenat et lin, toute l'année." },
    { value: "christmas", label: "Noël", help: "Sapin, houx et or, toute l'année." },
  ] as const;
  const modes = [
    { value: "device", label: "Comme mon appareil" },
    { value: "light", label: "Clair" },
    { value: "dark", label: "Sombre" },
  ] as const;

  const day = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  const activeTokens = $derived(data.tokens.filter((token) => token.active));
  let copied = $state(false);

  const tokenErrors: Record<string, string> = {
    invalid_name: "Donnez un nom au jeton, en 60 caractères au plus, par exemple « Home Assistant ».",
    invalid_days: "La durée va de 1 à 365 jours.",
  };
</script>

<svelte:head>
  <title>Réglages · {data.appName}</title>
</svelte:head>

<h1>Réglages</h1>

<section class="card" aria-labelledby="affichage">
  <h2 id="affichage">Vous et l'affichage</h2>
  <p class="muted">Ces réglages vous suivent sur tous vos appareils. Connecté avec {data.me.email}.</p>
  <form
    method="POST"
    action="?/display"
    use:enhance={() =>
      async ({ update }) =>
        update({ reset: false })}
  >
    <label for="nom">Votre prénom ou surnom</label>
    <input
      id="nom"
      name="displayName"
      required
      maxlength="80"
      autocomplete="given-name"
      value={data.me.displayName}
      aria-describedby="nom-aide"
    />
    <p id="nom-aide" class="muted help">C'est ce que voient vos proches.</p>

    <fieldset>
      <legend>Thème</legend>
      {#each themes as theme (theme.value)}
        <label class="choice">
          <input type="radio" name="theme" value={theme.value} checked={data.me.theme === theme.value} />
          <span><strong>{theme.label}</strong><span class="muted">{theme.help}</span></span>
        </label>
      {/each}
    </fieldset>

    <fieldset>
      <legend>Clair ou sombre</legend>
      {#each modes as mode (mode.value)}
        <label class="choice">
          <input type="radio" name="mode" value={mode.value} checked={data.me.mode === mode.value} />
          <span><strong>{mode.label}</strong></span>
        </label>
      {/each}
    </fieldset>

    {#if form?.display && "error" in form.display}
      <p class="notice error" role="alert">Écrivez un prénom ou un surnom, en 80 caractères au plus.</p>
    {/if}
    <div role="status">
      {#if form?.display && "saved" in form.display}<p class="notice">C'est enregistré.</p>{/if}
    </div>
    <button type="submit">Enregistrer</button>
  </form>
</section>

{#if data.apiOrigin}
  <section class="card" aria-labelledby="jetons">
    <h2 id="jetons">Jetons d'API</h2>
    <p class="muted">
      Pour un script ou la domotique (Home Assistant…) : un jeton donne accès à vos listes et événements,
      jamais à ce qui vous est offert. L'adresse de l'API est <code>{data.apiOrigin}/v1</code>.
    </p>

    {#if form?.token && "created" in form.token && form.token.created}
      {@const created = form.token.created}
      <div class="created">
        <h3>Le jeton « {created.name} »</h3>
        <p role="status">Copiez-le maintenant : il ne sera plus affiché.</p>
        <label for="jeton" class="visually-hidden">Jeton</label>
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
          {copied ? "Jeton copié" : "Copier le jeton"}
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
                <code>{token.prefix}…</code>{token.readOnly ? " · lecture seule" : ""} · jusqu'au {day.format(
                  new Date(token.expiresAt),
                )} · {token.lastUsedAt
                  ? `utilisé le ${day.format(new Date(token.lastUsedAt))}`
                  : "jamais utilisé"}
              </span>
            </div>
            <form method="POST" action="?/revokeToken" use:enhance>
              <input type="hidden" name="id" value={token.id} />
              <button type="submit" class="secondary" aria-label="Révoquer le jeton « {token.name} »">
                Révoquer
              </button>
            </form>
          </li>
        {/each}
      </ul>
    {/if}
    <div role="status" class="visually-hidden">
      {#if form?.revoke && "name" in form.revoke}Le jeton « {form.revoke.name} » est révoqué.{/if}
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
      <h3>Nouveau jeton</h3>
      {#if form?.token && "error" in form.token}
        <p class="notice error" role="alert">
          {tokenErrors[form.token.error] ?? "Le jeton n'a pas pu être créé. Réessayez."}
        </p>
      {/if}
      <div class="fields">
        <div>
          <label for="jeton-nom">Nom</label>
          <input
            id="jeton-nom"
            name="name"
            required
            maxlength="60"
            placeholder="Par exemple « Home Assistant »"
          />
        </div>
        <div>
          <label for="jeton-jours">Valable (jours)</label>
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
          <strong>Lecture seule</strong><span class="muted">Le script peut lire, jamais modifier.</span>
        </span>
      </label>
      <button type="submit">Créer le jeton</button>
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
