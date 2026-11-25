<script lang="ts">
  import { enhance } from "$app/forms";

  import type { List } from "./types.ts";

  /** A list's settings, folded under its title until asked for. */
  let {
    list,
    form,
  }: {
    list: List;
    form: {
      settings?: { error?: string; saved?: boolean; name?: string };
      reveal?: { error?: string; lifted?: boolean };
      archive?: { error?: string };
    } | null;
  } = $props();

  const errors: Record<string, string> = {
    invalid_name: "Donnez un nom à la liste, en 100 caractères au plus.",
    secret_already_lifted: "Le secret est levé : il ne se referme plus.",
    reveal_on_received: "Cette liste lève le secret à la réception de chaque envie.",
    confirm: "Cochez la case pour confirmer.",
  };
  const message = (code: string | undefined) =>
    code ? (errors[code] ?? "Le changement n'a pas abouti. Réessayez dans un instant.") : null;
  const failed = $derived(Boolean(form?.settings?.error || form?.reveal?.error || form?.archive?.error));
  const theme = $derived(list.theme ?? "none");
</script>

<details class="settings card" open={failed}>
  <summary>Réglages de la liste</summary>

  <form
    method="POST"
    action="?/settings"
    use:enhance={({ formData }) => {
      const themeChanged = formData.get("theme") !== theme;
      return async ({ result, update }) => {
        // The theme lives on <html>, drawn by the server: a new one needs a fresh page
        if (result.type === "success" && themeChanged) {
          window.location.reload();
          return;
        }
        await update({ reset: false });
      };
    }}
  >
    {#if message(form?.settings?.error)}
      <p class="notice error" role="alert">{message(form?.settings?.error)}</p>
    {/if}
    <label for="liste-nom">Nom</label>
    <input
      id="liste-nom"
      name="name"
      required
      maxlength="100"
      value={form?.settings?.name ?? list.name}
      aria-invalid={form?.settings?.error === "invalid_name" ? "true" : undefined}
    />

    <fieldset>
      <legend>Qui peut voir la liste ?</legend>
      <label class="choice">
        <input type="radio" name="visibility" value="private" checked={list.visibility === "private"} />
        <span>
          <strong>Privée</strong>
          <span class="muted">Seules les personnes à qui vous envoyez un lien de partage la voient.</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="visibility" value="public" checked={list.visibility === "public"} />
        <span>
          <strong>Publique</strong>
          <span class="muted">
            On la trouve depuis la page d'accueil, par votre nom ou celui de la liste, et tout le monde peut y
            participer. Les noms de ceux qui offrent n'y sont pas montrés.
          </span>
        </span>
      </label>
      {#if list.visibility === "public" && list.openUrl}
        <label for="liste-adresse" class="address-label">Adresse de la liste publique</label>
        <input id="liste-adresse" class="address" readonly value={list.openUrl} />
        <p class="muted help">
          Repasser la liste en privée coupe cette adresse aussitôt ; vos liens de partage continuent de
          marcher.
        </p>
      {/if}
    </fieldset>

    <fieldset>
      <legend>Thème</legend>
      <p class="muted help">
        Le thème imposé s'applique à tous ceux qui ouvrent la liste ; le mode clair ou sombre reste celui de
        chacun.
      </p>
      {#each [["none", "Celui de chacun", "Chacun voit la liste avec son propre thème."], ["neutral", "Neutre", "Ardoise, grenat et lin, en toute saison."], ["christmas", "Noël", "Sapin, houx et or."]] as [value, label, hint] (value)}
        <label class="choice">
          <input type="radio" name="theme" {value} checked={theme === value} />
          <span><strong>{label}</strong><span class="muted">{hint}</span></span>
        </label>
      {/each}
    </fieldset>

    <fieldset disabled={list.secretLifted}>
      <legend>Les cadeaux faits sans occasion</legend>
      <p class="muted help">
        Un proche peut offrir une envie de cette liste en dehors de tout événement. Quand découvrez-vous qui
        l'a offerte ?
      </p>
      <label class="choice">
        <input type="radio" name="revealMode" value="received" checked={list.revealMode === "received"} />
        <span>
          <strong>Quand je marque l'envie reçue</strong>
          <span class="muted">Le secret de chaque envie se lève à sa réception.</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="revealMode" value="manual" checked={list.revealMode === "manual"} />
        <span>
          <strong>Quand je le décide</strong>
          <span class="muted">Vous levez le secret de toute la liste d'un coup, quand vous voulez.</span>
        </span>
      </label>
    </fieldset>

    <button type="submit">Enregistrer</button>
  </form>

  {#if list.revealMode === "manual"}
    <section class="part" aria-labelledby="liste-secret">
      <h2 id="liste-secret">Le secret</h2>
      {#if list.secretLifted}
        <p>Le secret de cette liste est levé.</p>
      {:else}
        <p>
          Une fois levé, vous voyez qui vous a offert quoi en dehors des événements. Ce choix est définitif.
        </p>
        <form method="POST" action="?/reveal" use:enhance>
          {#if message(form?.reveal?.error)}
            <p class="notice error" role="alert">{message(form?.reveal?.error)}</p>
          {/if}
          <label class="choice">
            <input type="checkbox" name="confirm" value="oui" required />
            <span>Je veux voir qui m'a offert quoi</span>
          </label>
          <button type="submit" class="accent">Lever le secret de la liste</button>
        </form>
      {/if}
    </section>
  {/if}

  <section class="part" aria-labelledby="liste-archiver">
    <h2 id="liste-archiver">Archiver la liste</h2>
    <p>La liste disparaît de vos listes, et ses liens de partage n'affichent plus rien.</p>
    <form method="POST" action="?/archive" use:enhance>
      {#if message(form?.archive?.error)}
        <p class="notice error" role="alert">{message(form?.archive?.error)}</p>
      {/if}
      <label class="choice">
        <input type="checkbox" name="confirm" value="oui" required />
        <span>Je veux archiver « {list.name} »</span>
      </label>
      <button type="submit" class="secondary">Archiver la liste</button>
    </form>
  </section>
</details>

<style>
  .settings {
    margin: 0 0 1.5rem;
  }
  summary {
    min-height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
  }
  form {
    margin-top: 0.75rem;
  }
  form > input,
  fieldset {
    margin-bottom: 1rem;
  }
  fieldset {
    border: 0;
    padding: 0;
  }
  fieldset:disabled {
    opacity: 1;
  }
  legend {
    padding: 0;
    font-weight: 600;
  }
  .help {
    margin: 0.25rem 0 0.5rem;
    font-size: 0.95rem;
  }
  .choice {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    min-height: 48px;
    padding: 0.35rem 0;
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
  .choice > span {
    display: flex;
    flex-direction: column;
  }
  .address-label {
    margin-top: 0.5rem;
  }
  .address {
    font-family: ui-monospace, monospace;
    font-size: 0.9rem;
  }
  .part {
    border-top: 1px solid var(--border);
    margin-top: 1.25rem;
    padding-top: 0.5rem;
  }
  h2 {
    font-size: 1.1rem;
    margin: 0.5rem 0;
  }
</style>
