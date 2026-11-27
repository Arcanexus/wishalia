<script lang="ts">
  import { page } from "$app/state";
  import HelpTip from "@wishalia/ui/HelpTip.svelte";
  import { untrack } from "svelte";
  import { enhance } from "$app/forms";
  import { invalidate } from "$app/navigation";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import { autosave, type SaveState } from "./autosave.ts";
  import ConfirmDelete from "./ConfirmDelete.svelte";
  import IconButton from "./IconButton.svelte";
  import ListPictureSetting from "./ListPictureSetting.svelte";
  import SaveStatus from "./SaveStatus.svelte";
  import type { List } from "./types.ts";

  /**
   * A list's settings, under its title once the cog asked for them. Name, visibility, theme and
   * the secret's rule are saved as they change (docs/management-app.md, « Saved as you go »);
   * lifting the secret, archiving and deleting stay deliberate.
   */
  let {
    list,
    form,
    open = $bindable(false),
  }: {
    list: List;
    form: {
      settings?: { error?: string; saved?: boolean; name?: string };
      reveal?: { error?: string; lifted?: boolean };
      archive?: { error?: string };
      remove?: { error?: string; itemId?: string; title?: string };
    } | null;
    open?: boolean;
  } = $props();

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).listSettings);
  const removal = $derived(appMessages(i18n.locale).removal);
  const message = (code: string | undefined) => (code ? (m.errors[code] ?? m.failed) : null);
  // An item's deletion that failed says so next to the items, not here
  const listRemovalFailed = $derived(form?.remove?.error === "confirm");
  const failed = $derived(
    Boolean(form?.settings?.error || form?.reveal?.error || form?.archive?.error || listRemovalFailed),
  );
  $effect(() => {
    if (failed) open = true;
  });
  const theme = $derived(list.theme ?? "none");
  // The name as it starts: a reload after a save never overwrites what is being typed
  const name = untrack(() => form?.settings?.name ?? list.name);
  let saveState = $state<SaveState>(untrack(() => (form?.settings?.error ? "error" : "idle")));
  let error = $state<string | null>(untrack(() => form?.settings?.error ?? null));
  let settingsForm = $state<HTMLFormElement>();
  // The guide, for the « ? » next to a setting
  const help = $derived(String(page.data.help ?? ""));
</script>

{#if open}
  <section class="settings card" id="reglages-liste" aria-labelledby="reglages-liste-titre" data-live-hold>
    <div class="top">
      <h2 id="reglages-liste-titre">{m.title}</h2>
      <IconButton icon="close" label={m.close} tip={m.close} onclick={() => (open = false)} />
    </div>

    <form
      method="POST"
      action="?/settings"
      bind:this={settingsForm}
      use:autosave={{
        onState: (state) => (saveState = state),
        onResult: async (result) => {
          if (result.type === "success") {
            error = null;
            // The theme lives on <html>, drawn by the server: a new one needs a fresh page
            if (settingsForm && new FormData(settingsForm).get("theme") !== theme) {
              window.location.reload();
              return true;
            }
            await invalidate("wishalia:list");
            return true;
          }
          error =
            result.type === "failure"
              ? String((result.data?.settings as { error?: string } | undefined)?.error ?? "")
              : "";
          return false;
        },
      }}
    >
      <label for="liste-nom">{m.name}</label>
      <input
        id="liste-nom"
        name="name"
        required
        maxlength="100"
        value={name}
        aria-invalid={error === "invalid_name" ? "true" : undefined}
      />

      <fieldset>
        <legend>
          {m.visibility}<HelpTip about={m.visibilityTip.about} text={m.visibilityTip.text} {help} topic="share" />
        </legend>
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
        <legend>
          {m.reveal}<HelpTip about={m.revealTip.about} text={m.revealTip.text} {help} topic="surprise" />
        </legend>
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

      <SaveStatus state={saveState} error={error ? message(error) : null} />
    </form>

    <ListPictureSetting {list} />

    {#if list.revealMode === "manual"}
      <section class="part" aria-labelledby="liste-secret">
        <h3 id="liste-secret">{m.secret}</h3>
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

    <!-- Archive (it comes back from « Listes archivées ») and delete (a dialog asks first) -->
    <section class="part ends" aria-labelledby="liste-fin">
      <h3 id="liste-fin">{m.ends}</h3>
      {#if message(form?.archive?.error) || listRemovalFailed}
        <p class="notice error" role="alert">{message(form?.archive?.error ?? "confirm")}</p>
      {/if}
      <div class="end">
        <form method="POST" action="?/archive" use:enhance>
          <input type="hidden" name="confirm" value="oui" />
          <IconButton icon="archive" label={m.archiveLabel(list.name)} tip={m.archive} />
        </form>
        <p class="muted">{m.archiveHelp}</p>
      </div>
      <div class="end">
        <ConfirmDelete
          label={m.deleteLabel(list.name)}
          tip={m.delete}
          title={removal.listTitle(list.name)}
          help={[removal.listHelp, removal.guests]}
          action="?/deleteList"
          fields={{}}
        />
        <p class="muted">{m.deleteHelp}</p>
      </div>
    </section>
  </section>
{/if}

<style>
  .settings {
    margin: 0 0 1.5rem;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }
  .top h2 {
    margin: 0;
    font-size: 1.25rem;
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
  h3 {
    font-size: 1.1rem;
    margin: 0.5rem 0;
  }
  .end {
    display: flex;
    align-items: center;
    gap: 1rem;
    margin-top: 0.75rem;
  }
  .end p {
    margin: 0;
  }
</style>
