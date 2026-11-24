<script lang="ts">
  import { onMount } from "svelte";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";

  import Cropper from "#lib/Cropper.svelte";
  import { shrinkPhoto } from "#lib/photo.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const item = $derived(data.item);
  const on = $derived(data.me.features?.images ?? false);
  const proposals = $derived(data.images.images.filter((image) => image.source === "page"));
  const mine = $derived(data.images.images.find((image) => image.source === "upload"));
  const chosen = $derived(data.images.images.find((image) => image.id === data.images.imageId));

  const done: Record<string, string> = {
    uploaded: "Votre image est enregistrée et s'affiche sur l'envie.",
    chosen: "L'image choisie s'affiche sur l'envie.",
    cropped: "Le cadrage est enregistré.",
    whole: "L'image s'affiche entière.",
    removed: "L'envie n'a plus d'image.",
  };
  const errors: Record<string, string> = {
    no_file: "Choisissez d'abord une image sur votre appareil.",
    too_heavy: "Cette image pèse plus de 10 Mo. Choisissez-en une plus légère.",
    not_an_image:
      "Ce fichier n'est pas une image que Wishalia sait lire (JPEG, PNG, WebP, GIF, AVIF ou HEIC).",
    image_too_large: "Cette image est trop grande. Choisissez-en une plus petite.",
    images_off: "Les images ne sont pas activées sur ce serveur.",
    no_image: "Choisissez d'abord une image.",
  };
  const message = $derived(form?.image && "done" in form.image ? done[form.image.done] : null);
  const problem = $derived(
    form?.image && "error" in form.image
      ? (errors[form.image.error] ?? "L'enregistrement n'a pas abouti. Réessayez dans un instant.")
      : null,
  );

  let mounted = $state(false);
  onMount(() => (mounted = true));
  let sending = $state(false);
  let chosenFile = $state("");
</script>

<svelte:head>
  <title>Image de « {item.title} » · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)/listes/[id]", { id: item.listId })}>← Retour à la liste</a></p>
<h1>Image de « {item.title} »</h1>

<div role="status" class="visually-hidden">{message ?? ""}</div>
{#if message}<p class="notice" aria-hidden="true">{message}</p>{/if}
{#if problem}<p class="notice error" role="alert">{problem}</p>{/if}

{#if !on}
  <p class="notice">
    Les images ne sont pas activées sur ce serveur. La personne qui l'installe peut les activer (stockage S3
    et imgproxy).
  </p>
{:else}
  <section class="card current" aria-labelledby="actuelle-titre">
    <h2 id="actuelle-titre">L'image affichée</h2>
    {#if item.image}
      <img src={item.image.medium} alt="L'image affichée pour « {item.title} »" width="240" height="240" />
      <form method="POST" action="?/remove" use:enhance>
        <button type="submit" class="secondary">Ne plus afficher d'image</button>
      </form>
    {:else}
      <p class="muted">Pas encore d'image : choisissez-en une ci-dessous, ou envoyez la vôtre.</p>
    {/if}
  </section>

  {#if chosen && mounted}
    <section class="card" aria-labelledby="cadrer-titre">
      <h2 id="cadrer-titre">Recadrer</h2>
      <!-- Another image, another frame: the cropper starts again -->
      {#key chosen.id}
        <Cropper src={chosen.sources.large} crop={data.images.crop} title={item.title} />
      {/key}
    </section>
  {/if}

  <section class="card" aria-labelledby="page-titre">
    <h2 id="page-titre">Les images de la page</h2>
    {#if item.enrichment === "pending"}
      <p class="muted">Wishalia lit la page du lien : ses images arrivent dans un instant.</p>
    {:else if proposals.length === 0 && !mine}
      <p class="muted">
        {item.url
          ? "La page du lien ne propose pas d'image que Wishalia puisse reprendre."
          : "Ajoutez un lien à l'envie : Wishalia proposera les images de sa page."}
      </p>
    {/if}
    {#if proposals.length > 0 || mine}
      <form method="POST" action="?/choose" use:enhance>
        <fieldset>
          <legend class="visually-hidden">Choisir l'image affichée</legend>
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
                <span>Votre image</span>
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
                <span>Image {index + 1} de la page</span>
              </label>
            {/each}
          </div>
        </fieldset>
        <button type="submit">Afficher l'image choisie</button>
      </form>
    {/if}
  </section>

  <section class="card" aria-labelledby="envoyer-titre">
    <h2 id="envoyer-titre">Envoyer votre image</h2>
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
      <label for="image-fichier">Une photo ou une image de votre appareil</label>
      <p class="muted hint" id="image-aide">
        JPEG, PNG, WebP, GIF, AVIF ou HEIC, 10 Mo au plus. Sur un téléphone, vous pouvez aussi prendre une
        photo.
      </p>
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
        {sending ? "Envoi…" : chosenFile ? `Envoyer « ${chosenFile} »` : "Envoyer l'image"}
      </button>
    </form>
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
</style>
