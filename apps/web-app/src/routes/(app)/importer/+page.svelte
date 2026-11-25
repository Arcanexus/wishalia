<script lang="ts">
  import { onMount } from "svelte";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { formatAmount, cents, type ImportPreview } from "@wishalia/domain";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  type How = "lien" | "fichier" | "texte";
  const read = $derived(form?.read ?? null);
  const preview = $derived<(ImportPreview & { address?: string }) | null>(
    read && "preview" in read ? read.preview : null,
  );
  let reading = $state(false);
  let adding = $state(false);
  // The wishes left out: every one is kept until unticked (also without JavaScript)
  let unpicked = $derived<number[]>(
    form?.commit && "unpicked" in form.commit ? [...(form.commit.unpicked as number[])] : [],
  );
  // Without JavaScript, the three sources show at once and the server takes the one ticked
  let hydrated = $state(false);
  onMount(() => (hydrated = true));
  let target = $state("nouvelle");
  // The source of a refused read stays ticked
  let how = $derived<How>(
    read && "how" in read && (read.how === "fichier" || read.how === "texte") ? read.how : "lien",
  );
  const count = $derived(preview ? preview.items.length - unpicked.length : 0);
  const toggle = (index: number, on: boolean) => {
    unpicked = on ? unpicked.filter((other) => other !== index) : [...unpicked, index];
  };

  const SOURCES: Record<string, string> = {
    wishlistr: "Wishlistr",
    csv: "un fichier CSV",
    json: "un fichier JSON",
    text: "un texte",
  };

  const errors: Record<string, string> = {
    empty_address: "Collez l'adresse de la liste Wishlistr, par exemple « wishlistr.com/alex ».",
    invalid_address:
      "Ce n'est pas l'adresse d'une liste Wishlistr. Elle ressemble à « https://www.wishlistr.com/alex/ ».",
    remote_not_found:
      "Wishlistr ne trouve pas cette liste. Vérifiez l'adresse, et que la liste est bien publique.",
    remote_unreachable: "Wishlistr ne répond pas pour l'instant. Réessayez dans quelques minutes.",
    not_a_wishlistr_list: "Cette page de Wishlistr n'est pas une liste d'envies.",
    rate_limited: "Beaucoup d'essais en peu de temps : attendez une minute avant de réessayer.",
    empty_file: "Choisissez un fichier.",
    empty: "Collez au moins une envie, une par ligne.",
    too_large: "C'est trop long : 1 Mo au plus. Coupez le fichier en plusieurs.",
    invalid_csv: "Ce fichier CSV est mal formé : un guillemet n'est pas refermé.",
    invalid_json: "Ce fichier JSON est mal formé.",
    no_columns:
      "Les colonnes ne sont pas reconnues. Il faut au moins une colonne « Titre » (ou « Nom ») ou « Lien » (ou « URL »).",
    nothing_picked: "Cochez au moins une envie à importer.",
    invalid_name: "Donnez un nom à la nouvelle liste, en 100 caractères au plus.",
    not_found: "Cette liste n'existe plus. Choisissez-en une autre.",
  };
  const message = (code: string) => errors[code] ?? "L'import n'a pas abouti. Réessayez dans un instant.";

  const skippedLine = (preview: ImportPreview) => {
    const empty = preview.skipped.filter((skip) => skip.reason === "no_title").length;
    const over = preview.skipped.length - empty;
    const parts = [];
    if (empty)
      parts.push(
        empty === 1
          ? "1 ligne sans titre ni lien est laissée de côté"
          : `${empty} lignes sans titre ni lien sont laissées de côté`,
      );
    if (over) parts.push(`${over} de plus dépassent la limite de 500 envies par import`);
    return parts.join(" ; ");
  };
</script>

<svelte:head>
  <title>Importer une liste · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)")}>← Mes listes</a></p>
<h1>Importer une liste</h1>
<p class="muted lead">
  Vos envies sont ailleurs ? Reprenez-les ici en deux étapes : vous voyez d'abord ce qui sera ajouté, rien
  n'est ajouté avant que vous confirmiez.
</p>

{#if !preview}
  <form
    class="card"
    method="POST"
    action="?/read"
    enctype="multipart/form-data"
    use:enhance={() => {
      reading = true;
      return async ({ update }) => {
        reading = false;
        await update({ reset: false });
      };
    }}
  >
    <fieldset>
      <legend>D'où viennent vos envies ?</legend>
      <label class="choice">
        <input type="radio" name="how" value="lien" bind:group={how} />
        <span>
          <strong>Une liste Wishlistr</strong><br /><span class="muted">avec son adresse publique</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="how" value="fichier" bind:group={how} />
        <span>
          <strong>Un fichier</strong><br /><span class="muted">
            CSV ou JSON : un export d'un autre service, un tableur
          </span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="how" value="texte" bind:group={how} />
        <span>
          <strong>Un texte copié</strong><br /><span class="muted">
            une envie par ligne, un lien ou quelques mots
          </span>
        </span>
      </label>
    </fieldset>

    {#if !hydrated || how === "lien"}
      <label for="adresse">L'adresse de la liste Wishlistr</label>
      <input
        id="adresse"
        name="address"
        type="text"
        inputmode="url"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder="https://www.wishlistr.com/votre-nom/"
        value={read && "error" in read ? (read.address ?? "") : ""}
        aria-describedby="adresse-aide"
        required={hydrated}
      />
      <p id="adresse-aide" class="muted help">
        Sur Wishlistr, c'est l'adresse que vous donnez à vos proches (bouton « Share list »). La liste doit
        être visible sans compte.
      </p>
    {/if}
    {#if !hydrated || how === "fichier"}
      <label for="fichier">Le fichier</label>
      <input
        id="fichier"
        name="file"
        type="file"
        accept=".csv,.tsv,.json,.txt,text/csv,application/json,text/plain"
        aria-describedby="fichier-aide"
        required={hydrated}
      />
      <p id="fichier-aide" class="muted help">
        Une ligne par envie, avec des colonnes comme « Titre », « Lien », « Prix », « Quantité », « Notes »
        (en français ou en anglais). 1 Mo au plus.
      </p>
    {/if}
    {#if !hydrated || how === "texte"}
      <label for="texte">Vos envies, une par ligne</label>
      <textarea id="texte" name="text" rows="8" aria-describedby="texte-aide" required={hydrated}
        >{read && "error" in read ? (read.text ?? "") : ""}</textarea
      >
      <p id="texte-aide" class="muted help">
        Par exemple « Livre de cuisine » ou « https://… ». Une liste copiée depuis Amazon, une note ou un
        e-mail convient.
      </p>
    {/if}

    {#if read && "error" in read}
      <p class="notice error" role="alert">{message(read.error)}</p>
    {/if}

    <button type="submit" class="accent wide" disabled={reading} aria-busy={reading}>
      {reading ? "Lecture…" : "Voir ce qui sera importé"}
    </button>
  </form>
{:else}
  <form
    class="card"
    method="POST"
    action="?/commit"
    use:enhance={() => {
      adding = true;
      return async ({ update }) => {
        adding = false;
        await update({ reset: false });
      };
    }}
  >
    <h2 id="apercu-titre">
      {preview.items.length === 0
        ? "Aucune envie trouvée"
        : preview.items.length === 1
          ? "1 envie trouvée"
          : `${preview.items.length} envies trouvées`} dans {SOURCES[preview.source]}
    </h2>
    {#if preview.skipped.length > 0}
      <p class="muted">{skippedLine(preview)}.</p>
    {/if}

    <input type="hidden" name="source" value={preview.source} />
    <input type="hidden" name="payload" value={read && "payload" in read ? read.payload : "[]"} />

    {#if preview.items.length > 0}
      <fieldset>
        <legend>Les envies à importer <span class="muted">({count} sur {preview.items.length})</span></legend>
        <p class="bulk">
          <button type="button" class="secondary" onclick={() => (unpicked = [])}> Tout cocher </button>
          <button
            type="button"
            class="secondary"
            onclick={() => (unpicked = preview ? preview.items.map((_, index) => index) : [])}
          >
            Tout décocher
          </button>
        </p>
        <ul class="items">
          {#each preview.items as item, index (index)}
            <li>
              <label class="item">
                <input
                  type="checkbox"
                  name="pick"
                  value={index}
                  checked={!unpicked.includes(index)}
                  onchange={(event) => toggle(index, event.currentTarget.checked)}
                />
                <span class="text">
                  <span class="title">{item.title}</span>
                  <span class="muted details">
                    {[
                      item.url ? new URL(item.url).hostname.replace(/^www\./, "") : null,
                      item.priceCents !== null ? formatAmount(cents(item.priceCents)) : null,
                      item.quantity ? `× ${item.quantity}` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                  {#if item.notes}<span class="notes">{item.notes}</span>{/if}
                </span>
              </label>
            </li>
          {/each}
        </ul>
      </fieldset>

      <label for="cible">Dans la liste</label>
      <select id="cible" name="listId" bind:value={target}>
        <option value="nouvelle">Une nouvelle liste</option>
        {#each data.lists as list (list.id)}
          <option value={list.id}>{list.name}</option>
        {/each}
      </select>
      {#if target === "nouvelle"}
        <label for="nom">Son nom</label>
        <input
          id="nom"
          name="listName"
          maxlength="100"
          required={hydrated}
          value={preview.listName ??
            (preview.source === "wishlistr" ? "Ma liste Wishlistr" : "Mes envies importées")}
        />
      {/if}

      {#if form?.commit?.error}
        <p class="notice error" role="alert">{message(form.commit.error)}</p>
      {/if}

      <button type="submit" class="accent wide" disabled={adding || count === 0} aria-busy={adding}>
        {adding ? "Import…" : count === 1 ? "Importer 1 envie" : `Importer ${count} envies`}
      </button>
    {/if}
    <p class="again"><a href={resolve("/(app)/importer")}>Recommencer avec une autre source</a></p>
  </form>
{/if}

<style>
  .lead {
    margin-top: 0;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0 0 1rem;
  }
  legend {
    font-weight: 700;
    margin-bottom: 0.5rem;
  }
  .choice,
  .item {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    padding: 0.6rem 0.75rem;
    border: 2px solid var(--border);
    border-radius: 10px;
    margin-bottom: 0.5rem;
    cursor: pointer;
    font-weight: 400;
  }
  .choice:has(input:checked) {
    border-color: var(--action);
  }
  .choice input,
  .item input {
    width: 1.4rem;
    height: 1.4rem;
    min-height: 0;
    margin-top: 0.15rem;
    flex: none;
  }
  textarea {
    display: block;
    width: 100%;
    resize: vertical;
    font: inherit;
    padding: 0.6rem 0.9rem;
    border: 2px solid var(--border);
    border-radius: 10px;
    background: var(--surface);
    color: var(--text);
  }
  textarea:focus-visible {
    border-color: var(--focus);
  }
  input#adresse,
  input[type="file"],
  input#nom,
  select {
    width: 100%;
  }
  select {
    margin-bottom: 1rem;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 1rem;
  }
  .wide {
    width: 100%;
    margin-top: 1rem;
    font-size: 1.15rem;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 0;
    max-height: 60vh;
    overflow-y: auto;
  }
  .text {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }
  .title {
    font-weight: 700;
    overflow-wrap: anywhere;
  }
  .details,
  .notes {
    font-size: 0.95rem;
    overflow-wrap: anywhere;
  }
  .notes {
    white-space: pre-line;
  }
  .bulk {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0 0 0.75rem;
  }
  .again {
    margin: 1rem 0 0;
  }
</style>
