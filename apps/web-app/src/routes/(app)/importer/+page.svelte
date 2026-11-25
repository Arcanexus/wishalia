<script lang="ts">
  import { onMount } from "svelte";
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import type { ImportPreview } from "@wishalia/domain";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

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

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).import);
  const message = (code: string) => m.errors[code] ?? m.failed;

  const skippedLine = (preview: ImportPreview) => {
    const empty = preview.skipped.filter((skip) => skip.reason === "no_title").length;
    const over = preview.skipped.length - empty;
    const parts = [];
    if (empty) parts.push(m.skippedEmpty(empty));
    if (over) parts.push(m.skippedOver(over));
    return parts.join(m.skippedJoin);
  };
</script>

<svelte:head>
  <title>{m.title} · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)")}>{m.back}</a></p>
<h1>{m.title}</h1>
<p class="muted lead">{m.lead}</p>

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
      <legend>{m.from}</legend>
      <label class="choice">
        <input type="radio" name="how" value="lien" bind:group={how} />
        <span>
          <strong>{m.wishlistr.name}</strong><br /><span class="muted">{m.wishlistr.help}</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="how" value="fichier" bind:group={how} />
        <span>
          <strong>{m.file.name}</strong><br /><span class="muted">{m.file.help}</span>
        </span>
      </label>
      <label class="choice">
        <input type="radio" name="how" value="texte" bind:group={how} />
        <span>
          <strong>{m.text.name}</strong><br /><span class="muted">{m.text.help}</span>
        </span>
      </label>
    </fieldset>

    {#if !hydrated || how === "lien"}
      <label for="adresse">{m.address}</label>
      <input
        id="adresse"
        name="address"
        type="text"
        inputmode="url"
        spellcheck="false"
        autocapitalize="off"
        autocomplete="off"
        placeholder={m.addressPlaceholder}
        value={read && "error" in read ? (read.address ?? "") : ""}
        aria-describedby="adresse-aide"
        required={hydrated}
      />
      <p id="adresse-aide" class="muted help">{m.addressHelp}</p>
    {/if}
    {#if !hydrated || how === "fichier"}
      <label for="fichier">{m.fileLabel}</label>
      <input
        id="fichier"
        name="file"
        type="file"
        accept=".csv,.tsv,.json,.txt,text/csv,application/json,text/plain"
        aria-describedby="fichier-aide"
        required={hydrated}
      />
      <p id="fichier-aide" class="muted help">{m.fileHelp}</p>
    {/if}
    {#if !hydrated || how === "texte"}
      <label for="texte">{m.textLabel}</label>
      <textarea id="texte" name="text" rows="8" aria-describedby="texte-aide" required={hydrated}
        >{read && "error" in read ? (read.text ?? "") : ""}</textarea
      >
      <p id="texte-aide" class="muted help">{m.textHelp}</p>
    {/if}

    {#if read && "error" in read}
      <p class="notice error" role="alert">{message(read.error)}</p>
    {/if}

    <button type="submit" class="accent wide" disabled={reading} aria-busy={reading}>
      {reading ? m.reading : m.read}
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
      {m.found(preview.items.length, m.sources[preview.source] ?? preview.source)}
    </h2>
    {#if preview.skipped.length > 0}
      <p class="muted">{skippedLine(preview)}.</p>
    {/if}

    <input type="hidden" name="source" value={preview.source} />
    <input type="hidden" name="payload" value={read && "payload" in read ? read.payload : "[]"} />

    {#if preview.items.length > 0}
      <fieldset>
        <legend>{m.toImport} <span class="muted">{m.picked(count, preview.items.length)}</span></legend>
        <p class="bulk">
          <button type="button" class="secondary" onclick={() => (unpicked = [])}>{m.all}</button>
          <button
            type="button"
            class="secondary"
            onclick={() => (unpicked = preview ? preview.items.map((_, index) => index) : [])}
          >
            {m.none}
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
                      item.priceCents !== null ? i18n.fmt.money(item.priceCents) : null,
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

      <label for="cible">{m.list}</label>
      <select id="cible" name="listId" bind:value={target}>
        <option value="nouvelle">{m.newList}</option>
        {#each data.lists as list (list.id)}
          <option value={list.id}>{list.name}</option>
        {/each}
      </select>
      {#if target === "nouvelle"}
        <label for="nom">{m.name}</label>
        <input
          id="nom"
          name="listName"
          maxlength="100"
          required={hydrated}
          value={preview.listName ?? (preview.source === "wishlistr" ? m.defaultWishlistr : m.defaultName)}
        />
      {/if}

      {#if form?.commit?.error}
        <p class="notice error" role="alert">{message(form.commit.error)}</p>
      {/if}

      <button type="submit" class="accent wide" disabled={adding || count === 0} aria-busy={adding}>
        {adding ? m.importing : m.submit(count)}
      </button>
    {/if}
    <p class="again"><a href={resolve("/(app)/importer")}>{m.again}</a></p>
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
