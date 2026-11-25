<script lang="ts">
  import { enhance } from "$app/forms";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

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

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).listSettings);
  const message = (code: string | undefined) => (code ? (m.errors[code] ?? m.failed) : null);
  const failed = $derived(Boolean(form?.settings?.error || form?.reveal?.error || form?.archive?.error));
  const theme = $derived(list.theme ?? "none");
</script>

<details class="settings card" open={failed}>
  <summary>{m.title}</summary>

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
    <label for="liste-nom">{m.name}</label>
    <input
      id="liste-nom"
      name="name"
      required
      maxlength="100"
      value={form?.settings?.name ?? list.name}
      aria-invalid={form?.settings?.error === "invalid_name" ? "true" : undefined}
    />

    <fieldset>
      <legend>{m.visibility}</legend>
      <label class="choice">
        <input type="radio" name="visibility" value="private" checked={list.visibility === "private"} />
        <span>
          <strong>{m.private.name}</strong>
          <span class="muted">{m.private.help}</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="visibility" value="public" checked={list.visibility === "public"} />
        <span>
          <strong>{m.public.name}</strong>
          <span class="muted">{m.public.help}</span>
        </span>
      </label>
      {#if list.visibility === "public" && list.openUrl}
        <label for="liste-adresse" class="address-label">{m.address}</label>
        <input id="liste-adresse" class="address" readonly value={list.openUrl} />
        <p class="muted help">{m.addressHelp}</p>
      {/if}
    </fieldset>

    <fieldset>
      <legend>{m.theme}</legend>
      <p class="muted help">{m.themeHelp}</p>
      {#each ["none", "neutral", "christmas"] as const as value (value)}
        <label class="choice">
          <input type="radio" name="theme" {value} checked={theme === value} />
          <span>
            <strong>{m.themes[value].name}</strong><span class="muted">{m.themes[value].help}</span>
          </span>
        </label>
      {/each}
    </fieldset>

    <fieldset disabled={list.secretLifted}>
      <legend>{m.reveal}</legend>
      <p class="muted help">{m.revealHelp}</p>
      <label class="choice">
        <input type="radio" name="revealMode" value="received" checked={list.revealMode === "received"} />
        <span>
          <strong>{m.revealReceived.name}</strong>
          <span class="muted">{m.revealReceived.help}</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="revealMode" value="manual" checked={list.revealMode === "manual"} />
        <span>
          <strong>{m.revealManual.name}</strong>
          <span class="muted">{m.revealManual.help}</span>
        </span>
      </label>
    </fieldset>

    <button type="submit">{m.save}</button>
  </form>

  {#if list.revealMode === "manual"}
    <section class="part" aria-labelledby="liste-secret">
      <h2 id="liste-secret">{m.secret}</h2>
      {#if list.secretLifted}
        <p>{m.lifted}</p>
      {:else}
        <p>{m.liftHelp}</p>
        <form method="POST" action="?/reveal" use:enhance>
          {#if message(form?.reveal?.error)}
            <p class="notice error" role="alert">{message(form?.reveal?.error)}</p>
          {/if}
          <label class="choice">
            <input type="checkbox" name="confirm" value="oui" required />
            <span>{m.liftConfirm}</span>
          </label>
          <button type="submit" class="accent">{m.lift}</button>
        </form>
      {/if}
    </section>
  {/if}

  <section class="part" aria-labelledby="liste-archiver">
    <h2 id="liste-archiver">{m.archive}</h2>
    <p>{m.archiveHelp}</p>
    <form method="POST" action="?/archive" use:enhance>
      {#if message(form?.archive?.error)}
        <p class="notice error" role="alert">{message(form?.archive?.error)}</p>
      {/if}
      <label class="choice">
        <input type="checkbox" name="confirm" value="oui" required />
        <span>{m.archiveConfirm(list.name)}</span>
      </label>
      <button type="submit" class="secondary">{m.archive}</button>
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
