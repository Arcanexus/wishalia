<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { resolve } from "$app/paths";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import Cropper from "#lib/Cropper.svelte";
  import { shrinkPhoto } from "#lib/photo.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const item = $derived(data.item);
  const on = $derived(data.me.features?.images ?? false);
  const proposals = $derived(data.images.images.filter((image) => image.source === "page"));
  const mine = $derived(data.images.images.find((image) => image.source === "upload"));
  const chosen = $derived(data.images.images.find((image) => image.id === data.images.imageId));

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).image);
  const message = $derived(form?.image && "done" in form.image ? m.done[form.image.done] : null);
  const problem = $derived(
    form?.image && "error" in form.image
      ? (m.errors[form.image.error] ?? m.failed)
      : null,
  );

  // While Wishalia reads the link, the page looks again every 3 seconds, for a minute at most
  let polls = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    if (item.enrichment !== "pending" || polls >= 20) return;
    timer = setTimeout(() => {
      polls += 1;
      void invalidateAll();
    }, 3000);
    return () => clearTimeout(timer);
  });
  onDestroy(() => clearTimeout(timer));

  let mounted = $state(false);
  onMount(() => (mounted = true));
  let sending = $state(false);
  let chosenFile = $state("");
</script>

<svelte:head>
  <title>{m.title(item.title)} · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)/listes/[id]", { id: item.listId })}>{m.back}</a></p>
<h1>{m.title(item.title)}</h1>

<div role="status" class="visually-hidden">{message ?? ""}</div>
{#if message}<p class="notice" aria-hidden="true">{message}</p>{/if}
{#if problem}<p class="notice error" role="alert">{problem}</p>{/if}

{#if !on}
  <p class="notice">{m.off}</p>
{:else}
  <section class="card current" aria-labelledby="actuelle-titre">
    <h2 id="actuelle-titre">{m.current}</h2>
    {#if item.image}
      <img src={item.image.medium} alt={m.currentAlt(item.title)} width="240" height="240" />
      <form method="POST" action="?/remove" use:enhance>
        <button type="submit" class="secondary">{m.remove}</button>
      </form>
    {:else}
      <p class="muted">{m.none}</p>
    {/if}
  </section>

  {#if chosen && mounted}
    <section class="card" aria-labelledby="cadrer-titre">
      <h2 id="cadrer-titre">{m.crop}</h2>
      <!-- Another image, another frame: the cropper starts again -->
      {#key chosen.id}
        <Cropper src={chosen.sources.large} crop={data.images.crop} title={item.title} />
      {/key}
    </section>
  {/if}

  <section class="card" aria-labelledby="page-titre">
    <h2 id="page-titre">{m.page}</h2>
    {#if item.enrichment === "pending"}
      <p class="muted">{m.reading}</p>
    {:else if proposals.length === 0 && !mine}
      <p class="muted">
        {item.url ? m.noneOnPage : m.addLink}
      </p>
    {/if}
    {#if proposals.length > 0 || mine}
      <form method="POST" action="?/choose" use:enhance>
        <fieldset>
          <legend class="visually-hidden">{m.choose}</legend>
          <div class="choices">
            {#if mine}
              <label class="choice">
                <input
                  type="radio"
                  name="imageId"
                  value={mine.id}
                  checked={mine.id === data.images.imageId}
                />
                <img src={mine.sources.small} alt="" width="192" height="192" loading="lazy" />
                <span>{m.yours}</span>
              </label>
            {/if}
            {#each proposals as image, index (image.id)}
              <label class="choice">
                <input
                  type="radio"
                  name="imageId"
                  value={image.id}
                  checked={image.id === data.images.imageId}
                />
                <img src={image.sources.small} alt="" width="192" height="192" loading="lazy" />
                <span>{m.nth(index + 1)}</span>
              </label>
            {/each}
          </div>
        </fieldset>
        <button type="submit">{m.show}</button>
      </form>
    {/if}
  </section>

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
      <label for="image-fichier">{m.file}</label>
      <p class="muted hint" id="image-aide">{m.fileHelp}</p>
      <input
        id="image-fichier"
        name="image"
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/avif,image/heic,image/heif"
        aria-describedby="image-aide"
        required
        onchange={(event) => (chosenFile = event.currentTarget.files?.[0]?.name ?? "")}
      />
      <button type="submit" disabled={sending}>
        {sending ? m.sending : chosenFile ? m.sendFile(chosenFile) : m.send}
      </button>
    </form>
    {#if mine}
      <form method="POST" action="?/forget" use:enhance class="forget">
        <p class="muted hint" id="retirer-aide">
          {item.url ? m.forgetWithLink : m.forgetNoLink}
        </p>
        <button type="submit" class="secondary" aria-describedby="retirer-aide">{m.forget}</button>
      </form>
    {/if}
  </section>
{/if}

<style>
  .back {
    margin: 0 0 0.5rem;
  }
  h1 {
    overflow-wrap: anywhere;
  }
  section {
    margin-bottom: 1rem;
  }
  h2 {
    font-size: 1.2rem;
    margin: 0 0 0.75rem;
  }
  .current img {
    display: block;
    width: 15rem;
    max-width: 100%;
    height: auto;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 12px;
    margin-bottom: 0.75rem;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 1rem;
  }
  .choices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr));
    gap: 0.75rem;
  }
  .choice {
    display: grid;
    gap: 0.4rem;
    padding: 0.5rem;
    border: 2px solid var(--border);
    border-radius: 12px;
    cursor: pointer;
    font-weight: 400;
    position: relative;
  }
  .choice:has(input:checked) {
    border-color: var(--action);
    box-shadow: 0 0 0 2px var(--action);
  }
  .choice:has(input:focus-visible) {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }
  .choice input {
    position: absolute;
    top: 0.9rem;
    left: 0.9rem;
    width: 1.4rem;
    height: 1.4rem;
    margin: 0;
    accent-color: var(--action);
  }
  .choice img {
    width: 100%;
    height: auto;
    aspect-ratio: 1;
    object-fit: cover;
    border-radius: 8px;
    background: var(--border);
  }
  .hint {
    margin: 0 0 0.5rem;
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
