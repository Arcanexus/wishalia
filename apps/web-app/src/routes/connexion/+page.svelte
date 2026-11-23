<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";

  import Logo from "#lib/Logo.svelte";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  let sending = $state(false);

  const errors: Record<string, string> = {
    invalid_email: "Cette adresse e-mail ne semble pas complète. Vérifiez-la, par exemple marie@exemple.fr.",
    too_many: "Trop de demandes d'un coup. Patientez une minute, puis réessayez.",
    unavailable: "La connexion est indisponible pour le moment. Réessayez dans quelques minutes.",
  };
</script>

<svelte:head>
  <title>Connexion · {data.appName}</title>
</svelte:head>

<main id="contenu" class="sign-in">
  <div class="brand">
    <Logo size={72} />
    <p class="name">{data.appName}</p>
  </div>

  <div class="card">
    {#if form && "sent" in form}
      <h1>Regardez vos e-mails</h1>
      <p role="status">
        Nous avons envoyé un lien de connexion à <strong>{form.sent}</strong>. Ouvrez-le sur cet appareil : il
        reste valable quelques minutes.
      </p>
      <p class="muted">Rien reçu ? Regardez dans les indésirables, ou recommencez.</p>
      <a class="button secondary" href={resolve("/connexion")}>Recommencer</a>
    {:else}
      <h1>Connexion</h1>
      {#if data.signedOut}
        <p class="notice" role="status">Vous êtes déconnecté. À bientôt !</p>
      {/if}
      {#if data.failed}
        <p class="notice error" role="alert">
          Ce lien de connexion ne fonctionne plus. Il a peut-être déjà servi ou expiré : demandez-en un
          nouveau.
        </p>
      {/if}
      {#if form?.error}
        <p class="notice error" role="alert">{errors[form.error] ?? errors.unavailable}</p>
      {/if}

      <form
        method="POST"
        action="?/email"
        use:enhance={() => {
          sending = true;
          return async ({ update }) => {
            await update({ reset: false });
            sending = false;
          };
        }}
      >
        <label for="email">Votre adresse e-mail</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email"
          inputmode="email"
          required
          value={form && "email" in form ? form.email : ""}
          aria-describedby="email-aide"
          aria-invalid={form?.error === "invalid_email" ? "true" : undefined}
        />
        <p id="email-aide" class="muted help">
          Nous vous envoyons un lien qui vous connecte, sans mot de passe.
        </p>
        <button type="submit" disabled={sending}>
          {sending ? "Envoi…" : "Recevoir mon lien de connexion"}
        </button>
      </form>

      {#if data.oidc}
        <p class="or"><span>ou</span></p>
        <form method="POST" action="?/oidc">
          <button type="submit" class="secondary wide">Se connecter avec {data.oidcName}</button>
        </form>
      {/if}
    {/if}
  </div>
</main>

<style>
  .sign-in {
    max-width: 28rem;
    margin: 0 auto;
    padding: 2.5rem 1rem 3rem;
  }
  .brand {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 1.5rem;
  }
  .name {
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.6rem;
    margin: 0;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 1rem;
  }
  form button,
  .wide {
    width: 100%;
  }
  .notice {
    margin: 0 0 1rem;
  }
  .or {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin: 1.25rem 0;
    color: var(--text-2);
  }
  .or::before,
  .or::after {
    content: "";
    flex: 1;
    border-top: 1px solid var(--border);
  }
</style>
