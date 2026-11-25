<script lang="ts">
  import { onMount } from "svelte";

  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import LanguageButtons from "@wishalia/ui/LanguageButtons.svelte";
  import Logo from "@wishalia/ui/Logo.svelte";
  import {
    passkeyAutofillSupported,
    passkeysSupported,
    signInWithPasskey,
    type PasskeyOutcome,
  } from "#lib/passkey.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).signIn);
  let sending = $state(false);
  /** Passkeys need JavaScript: the button shows once the page runs in the browser. */
  let passkeys = $state(false);
  let signingIn = $state(false);
  let passkeyOutcome = $state<PasskeyOutcome | null>(null);

  /** quiet: the suggestions started on their own, so a failure nobody asked for stays unsaid. */
  function settle(outcome: PasskeyOutcome, quiet = false) {
    // The session cookie is set: a full load, so that every part of the app sees it
    if (outcome === "ok") window.location.assign(data.returnPath);
    else if (outcome === "unknown_key" || (!quiet && outcome !== "cancelled")) passkeyOutcome = outcome;
  }

  onMount(() => {
    passkeys = passkeysSupported();
    // The passkeys of this device are offered in the email field's suggestions too
    void passkeyAutofillSupported().then(async (autofill) => {
      if (autofill) settle(await signInWithPasskey({ autofill: true }), true);
    });
  });

  async function withPasskey() {
    signingIn = true;
    passkeyOutcome = null;
    const outcome = await signInWithPasskey();
    signingIn = outcome === "ok";
    settle(outcome);
  }
</script>

<svelte:head>
  <title>{m.title} · {data.appName}</title>
</svelte:head>

<main id="contenu" class="sign-in">
  <div class="brand">
    <Logo size={72} />
    <p class="name">{data.appName}</p>
    <LanguageButtons returnPath={page.url.pathname + page.url.search} />
  </div>

  <div class="card">
    {#if form && "sent" in form}
      <h1>{m.checkMail}</h1>
      <p role="status">{m.sent.before}<strong>{form.sent}</strong>{m.sent.after}</p>
      <p class="muted">{m.nothing}</p>
      <a class="button secondary" href={resolve("/connexion")}>{m.again}</a>
    {:else}
      <h1>{m.title}</h1>
      {#if data.signedOut}
        <p class="notice" role="status">{m.signedOut}</p>
      {/if}
      {#if data.failed}
        <p class="notice error" role="alert">{m.linkFailed}</p>
      {/if}
      {#if form?.error}
        <p class="notice error" role="alert">{m.errors[form.error] ?? m.errors.unavailable}</p>
      {/if}
      {#if passkeyOutcome && m.passkeyErrors[passkeyOutcome]}
        <p class="notice error" role="alert">{m.passkeyErrors[passkeyOutcome]}</p>
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
        <label for="email">{m.email}</label>
        <input
          id="email"
          name="email"
          type="email"
          autocomplete="email webauthn"
          inputmode="email"
          required
          value={form && "email" in form ? form.email : ""}
          aria-describedby="email-aide"
          aria-invalid={form?.error === "invalid_email" ? "true" : undefined}
        />
        <p id="email-aide" class="muted help">{m.emailHelp}</p>
        <button type="submit" disabled={sending}>
          {sending ? m.sending : m.send}
        </button>
      </form>

      {#if passkeys}
        <p class="or"><span>{m.or}</span></p>
        <button type="button" class="secondary wide" disabled={signingIn} onclick={withPasskey}>
          {signingIn ? m.signingIn : m.passkey}
        </button>
        <p class="muted help">{m.passkeyHelp}</p>
      {/if}

      {#if data.oidc}
        <p class="or"><span>{m.or}</span></p>
        <form method="POST" action="?/oidc">
          <button type="submit" class="secondary wide">{m.oidc(data.oidcName)}</button>
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
