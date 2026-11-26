<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";

  import { DEFAULT_LIST_ICON, isListIcon, LIST_ICONS } from "@wishalia/domain";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import ListBadge from "@wishalia/ui/ListBadge.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import { shrinkPhoto } from "#lib/photo.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const list = $derived(data.list);
  const on = $derived(data.me.features?.images ?? false);
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).listPicture);
  const message = $derived(form?.picture && "done" in form.picture ? m.done[form.picture.done] : null);
  const problem = $derived(
    form?.picture && "error" in form.picture ? (m.errors[form.picture.error] ?? m.failed) : null,
  );
  // The icon a list without a choice shows is the one ticked
  const current = $derived(isListIcon(list.icon) ? list.icon : DEFAULT_LIST_ICON);

  let sending = $state(false);
  let chosenFile = $state("");
  // Escape hides the tips until the pointer or the focus moves again (WCAG 1.4.13)
  let quiet = $state(false);
</script>

<svelte:window onpointermove={() => (quiet = false)} />

<svelte:head>
  <title>{m.title(list.name)} · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)/listes/[id]", { id: list.id })}>{m.back}</a></p>
<h1>{m.title(list.name)}</h1>
<p class="muted lead">{m.help}</p>

<div role="status" class="visually-hidden">{message ?? ""}</div>
{#if message}<p class="notice" aria-hidden="true">{message}</p>{/if}
{#if problem}<p class="notice error" role="alert">{problem}</p>{/if}

<section class="card current" aria-labelledby="actuelle-titre">
  <h2 id="actuelle-titre">{m.current}</h2>
  <div class="shown">
    <ListBadge picture={list} size="large" />
    <span class="name">{list.name}</span>
  </div>
</section>

<section class="card" aria-labelledby="icones-titre">
  <h2 id="icones-titre">{m.icons}</h2>
  <p class="muted hint" id="icones-aide">
    {m.iconsHelp}
    {#if list.image}{m.iconReplaces}{/if}
  </p>
  <form
    method="POST"
    action="?/icon"
    onchange={(event) => event.currentTarget.requestSubmit()}
    use:enhance={() =>
      async ({ update }) =>
        update({ reset: false })}
  >
    <fieldset aria-describedby="icones-aide" class:quiet>
      <legend class="visually-hidden">{m.icons}</legend>
      <div class="icons">
        {#each LIST_ICONS as icon (icon)}
          <label class="icon-choice">
            <input
              class="visually-hidden"
              type="radio"
              name="icon"
              value={icon}
              checked={!list.image && current === icon}
              onkeydown={(event) => {
                if (event.key === "Escape") quiet = true;
              }}
              onfocus={() => (quiet = false)}
            />
            <ListBadge picture={{ icon, image: null }} size="medium" />
            <span class="visually-hidden">{m.names[icon]}</span>
            <svg class="tick" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            <span class="tip" aria-hidden="true">{m.names[icon]}</span>
          </label>
        {/each}
      </div>
    </fieldset>
    <!-- A tap on an icon is the choice, saved at once; without JavaScript, a button -->
    <noscript><button type="submit">{m.saveIcon}</button></noscript>
  </form>
</section>

{#if on}
  <section class="card" aria-labelledby="envoyer-titre">
    <h2 id="envoyer-titre">{m.upload}</h2>
    <form
      method="POST"
      action="?/upload"
      enctype="multipart/form-data"
      use:enhance={async ({ formData }) => {
        sending = true;
        // A big photo is made lighter on the device first: quicker to send, on any connection
        const file = formData.get("image");
        if (file instanceof File && file.size > 0) {
          const lighter = await shrinkPhoto(file);
          if (lighter !== file) formData.set("image", lighter, "photo.jpg");
        }
        return async ({ update }) => {
          await update();
          sending = false;
          chosenFile = "";
        };
      }}
    >
      <label for="liste-image">{m.file}</label>
      <p class="muted hint" id="liste-image-aide">{m.fileHelp}</p>
      <input
        id="liste-image"
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
        aria-describedby="liste-image-aide"
        required
        onchange={(event) => {
          chosenFile = event.currentTarget.files?.[0]?.name ?? "";
          // The photo chosen is sent at once
          if (chosenFile) event.currentTarget.form?.requestSubmit();
        }}
      />
      <p class="muted hint" role="status">{sending ? m.sending : ""}</p>
      <noscript><button type="submit">{m.send}</button></noscript>
    </form>
    {#if list.image}
      <form method="POST" action="?/forget" use:enhance class="forget">
        <p class="muted hint" id="retirer-aide">{m.forgetHelp}</p>
        <button type="submit" class="secondary" aria-describedby="retirer-aide">{m.forget}</button>
      </form>
    {/if}
  </section>
{:else}
  <p class="notice">{m.off}</p>
{/if}

<style>
  .back {
    margin: 0 0 0.5rem;
  }
  h1 {
    overflow-wrap: anywhere;
  }
  .lead {
    margin-top: 0;
  }
  section {
    margin-bottom: 1rem;
  }
  h2 {
    font-size: 1.2rem;
    margin: 0 0 0.75rem;
  }
  .shown {
    display: flex;
    align-items: center;
    gap: 1rem;
  }
  .name {
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.3rem;
    overflow-wrap: anywhere;
  }
  .hint {
    margin: 0 0 0.75rem;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 1rem;
  }
  .icons {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(4.5rem, 1fr));
    gap: 0.5rem;
  }
  .icon-choice {
    position: relative;
    display: grid;
    place-items: center;
    min-height: 4.5rem;
    border: 2px solid transparent;
    border-radius: 16px;
    cursor: pointer;
  }
  .icon-choice:hover {
    border-color: var(--border);
  }
  .icon-choice:has(input:checked) {
    border-color: var(--action);
    box-shadow: 0 0 0 2px var(--action);
  }
  .icon-choice:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .tick {
    position: absolute;
    top: 0.2rem;
    right: 0.2rem;
    display: none;
    width: 1.3rem;
    height: 1.3rem;
    padding: 0.15rem;
    border-radius: 50%;
    background: var(--action);
    fill: none;
    stroke: var(--on-action);
    stroke-width: 3;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .icon-choice:has(input:checked) .tick {
    display: block;
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    z-index: 2;
    transform: translateX(-50%);
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    background: var(--text);
    color: var(--surface);
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    pointer-events: none;
    visibility: hidden;
  }
  .icon-choice:hover .tip,
  .icon-choice:has(input:focus-visible) .tip {
    visibility: visible;
  }
  .quiet .tip {
    visibility: hidden !important;
  }
  input[type="file"] {
    display: block;
    margin-bottom: 1rem;
    min-height: 48px;
    font: inherit;
  }
  .forget {
    margin-top: 1.5rem;
    border-top: 1px solid var(--border);
    padding-top: 1rem;
  }
</style>
