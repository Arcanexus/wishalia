<script lang="ts">
  import { enhance } from "$app/forms";

  import type { ShareLink } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const labels = $derived(new Map(data.targets.map((target) => [target.value, target.label])));
  const targetOf = (link: ShareLink) =>
    labels.get(link.scope === "list" ? `list:${link.listId}` : `event:${link.eventId}`) ?? "Supprimé";
  const active = $derived(data.links.filter((link) => link.active));
  const ended = $derived(data.links.filter((link) => !link.active));
  const day = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

  let copied = $state(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    copied = true;
  }

  const errors: Record<string, string> = {
    invalid_target: "Choisissez la liste ou l'événement à partager.",
    invalid_audience: "Dites pour qui est le lien, en 60 caractères au plus, par exemple « Mamie ».",
    invalid_expires: "La date de fin doit être dans le futur.",
    not_found: "Cette liste ou cet événement n'existe plus. Rechargez la page.",
  };
  const createValues = $derived(form?.create ?? null);
</script>

<svelte:head>
  <title>Partager · {data.appName}</title>
</svelte:head>

<h1>Partager</h1>
<p class="muted intro">
  Un lien par personne ou par groupe : « Mamie », « Les cousins ». Avec lui, on voit vos envies et on peut
  vous les offrir. Vous, vous ne voyez rien de ce qui est choisi, jusqu'à ce que vous leviez le secret.
</p>

{#if form && "created" in form && form.created}
  <section class="card created" aria-labelledby="lien-cree">
    <h2 id="lien-cree">Le lien pour {form.created.audience}</h2>
    <p role="status">Copiez-le maintenant : pour votre sécurité, il ne sera plus affiché.</p>
    <label for="lien" class="visually-hidden">Adresse du lien</label>
    <input
      id="lien"
      type="text"
      readonly
      value={form.created.url}
      onfocus={(event) => event.currentTarget.select()}
    />
    <div class="actions">
      <button type="button" class="accent" onclick={() => copy(form.created.url)}>
        {copied ? "Lien copié" : "Copier le lien"}
      </button>
      {#if canShare}
        <button
          type="button"
          class="secondary"
          onclick={() => navigator.share({ title: `Mes envies`, url: form.created.url }).catch(() => {})}
        >
          Envoyer…
        </button>
      {/if}
    </div>
    <p class="visually-hidden" aria-live="polite">{copied ? "Le lien est copié." : ""}</p>
  </section>
{/if}

<section class="card create" aria-labelledby="nouveau-lien">
  <h2 id="nouveau-lien">Nouveau lien</h2>
  {#if createValues?.error}
    <p class="notice error" role="alert">
      {errors[createValues.error] ?? "Le lien n'a pas pu être créé. Réessayez."}
    </p>
  {/if}
  {#if data.targets.length === 0}
    <p class="muted">Créez d'abord une liste ou un événement : c'est ce que le lien partage.</p>
  {:else}
    <form
      method="POST"
      action="?/create"
      use:enhance={() => {
        copied = false;
        return async ({ update }) => update();
      }}
    >
      <div class="fields">
        <div class="wide">
          <label for="cible">À partager</label>
          <select id="cible" name="target" required>
            {#each data.targets as target (target.value)}
              <option value={target.value} selected={(createValues?.target ?? data.preset) === target.value}>
                {target.label}
              </option>
            {/each}
          </select>
        </div>
        <div>
          <label for="pour">Pour qui</label>
          <input
            id="pour"
            name="audience"
            required
            maxlength="60"
            placeholder="Par exemple « Mamie »"
            value={createValues?.audience ?? ""}
            aria-invalid={createValues?.error === "invalid_audience" ? "true" : undefined}
          />
        </div>
        <div>
          <label for="fin">Jusqu'au (facultatif)</label>
          <input
            id="fin"
            name="expires"
            type="date"
            value={createValues?.expires ?? ""}
            aria-describedby="fin-aide"
            aria-invalid={createValues?.error === "invalid_expires" ? "true" : undefined}
          />
          <p id="fin-aide" class="muted help">Sans date, le lien marche jusqu'à ce que vous le révoquiez.</p>
        </div>
      </div>
      <button type="submit">Créer le lien</button>
    </form>
  {/if}
</section>

<div role="status" class="visually-hidden">
  {#if form && "revoke" in form && form.revoke && "audience" in form.revoke}Le lien pour {form.revoke
      .audience} est révoqué.{/if}
</div>
{#if form && "revoke" in form && form.revoke && "error" in form.revoke}
  <p class="notice error" role="alert">La révocation n'a pas abouti. Rechargez la page et réessayez.</p>
{/if}

<section aria-labelledby="actifs">
  <h2 id="actifs">Liens actifs ({active.length})</h2>
  {#if active.length === 0}
    <p class="muted">Aucun lien pour l'instant.</p>
  {:else}
    <ul class="links">
      {#each active as link (link.id)}
        <li class="card link">
          <div class="text">
            <h3>{link.audience}</h3>
            <p class="muted meta">
              {targetOf(link)} · créé le {day.format(new Date(link.createdAt))}{link.expiresAt
                ? ` · jusqu'au ${day.format(new Date(link.expiresAt))}`
                : ""}
            </p>
          </div>
          <details class="revoke">
            <summary>Révoquer</summary>
            <form method="POST" action="?/revoke" use:enhance>
              <input type="hidden" name="id" value={link.id} />
              <p>{link.audience} ne pourra plus ouvrir ce lien. C'est définitif.</p>
              <button type="submit" class="accent">Révoquer le lien pour {link.audience}</button>
            </form>
          </details>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if ended.length > 0}
  <details class="ended">
    <summary>Liens révoqués ou expirés ({ended.length})</summary>
    <ul class="links">
      {#each ended as link (link.id)}
        <li class="card link">
          <div class="text">
            <h3>{link.audience}</h3>
            <p class="muted meta">
              {targetOf(link)} · {link.revokedAt
                ? `révoqué le ${day.format(new Date(link.revokedAt))}`
                : "expiré"}
            </p>
          </div>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .intro {
    margin: -0.25rem 0 1.5rem;
  }
  .created {
    border: 2px solid var(--action);
    margin-bottom: 1.5rem;
  }
  .created input {
    font-size: 0.95rem;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .create {
    margin-bottom: 2rem;
  }
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 0;
  }
  .notice {
    margin: 0 0 1rem;
  }
  .links {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    display: grid;
    gap: 0.75rem;
  }
  .link {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .text {
    flex: 1 1 16rem;
    min-width: 0;
  }
  h3 {
    font-size: 1.15rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .meta {
    margin: 0.25rem 0 0;
  }
  summary {
    min-height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
  }
  .revoke summary {
    padding: 0 1rem;
    border: 2px solid var(--border);
    border-radius: 10px;
  }
  .revoke[open] {
    flex-basis: 100%;
  }
  .revoke form {
    margin-top: 0.75rem;
  }
  @media (max-width: 30rem) {
    .fields {
      grid-template-columns: 1fr;
    }
  }
</style>
