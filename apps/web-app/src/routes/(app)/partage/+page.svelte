<script lang="ts">
  import { onMount } from "svelte";
  import { enhance } from "$app/forms";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import Icon from "@wishalia/ui/Icon.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import IconButton from "#lib/IconButton.svelte";

  import type { ShareLink } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).share);

  const labels = $derived(new Map(data.targets.map((target) => [target.value, target.label])));
  const targetOf = (link: ShareLink) =>
    labels.get(link.scope === "list" ? `list:${link.listId}` : `event:${link.eventId}`) ?? m.deleted;
  const active = $derived(data.links.filter((link) => link.active));
  const ended = $derived(data.links.filter((link) => !link.active));
  const day = (iso: string) => i18n.fmt.date(iso);

  let copied = $state(false);
  const canShare = typeof navigator !== "undefined" && "share" in navigator;

  async function copy(url: string) {
    await navigator.clipboard.writeText(url);
    copied = true;
  }

  const createValues = $derived(form?.create ?? null);
  let showQr = $state(false);
  let hydrated = $state(false);
  onMount(() => (hydrated = true));
  /** The QR code as a file to keep: the same drawing, as an SVG image. */
  const qrFile = (qr: { size: number; path: string }) =>
    `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${qr.size} ${qr.size}" width="${qr.size * 10}" height="${qr.size * 10}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="#fff"/><path d="${qr.path}" fill="#000"/></svg>`,
    )}`;
</script>

<svelte:head>
  <title>{m.title} · {data.appName}</title>
</svelte:head>

<h1>{m.title}</h1>
<p class="muted intro">{m.intro}</p>

{#if form && "created" in form && form.created}
  <section class="card created" aria-labelledby="lien-cree">
    <h2 id="lien-cree">{m.linkFor(form.created.audience)}</h2>
    <p role="status">{m.copyNow}</p>
    <label for="lien" class="visually-hidden">{m.address}</label>
    <input
      id="lien"
      type="text"
      readonly
      value={form.created.url}
      onfocus={(event) => event.currentTarget.select()}
    />
    <div class="created-body">
      <div class="created-link">
        <div class="actions">
          {#if canShare}
            <button
              type="button"
              class="accent"
              onclick={() => navigator.share({ title: m.shareTitle, url: form.created.url }).catch(() => {})}
            >
              <Icon name="send" />{m.send}
            </button>
          {/if}
          <button
            type="button"
            class={canShare ? "secondary" : "accent"}
            onclick={() => copy(form.created.url)}
          >
            <Icon name={copied ? "check" : "copy"} />{copied ? m.copied : m.copy}
          </button>
          <IconButton
            icon="qr"
            label={showQr ? m.qr.hide : m.qr.label}
            tip={m.qr.tip}
            expanded={showQr}
            controls="qr-lien"
            onclick={() => (showQr = !showQr)}
          />
        </div>
        {#if canShare}<p class="muted help">{m.sendHelp}</p>{/if}
      </div>
      <!-- Open without JavaScript: the buttons that hide it need it -->
      <figure class="qr" id="qr-lien" hidden={hydrated && !showQr}>
        <svg
          viewBox="0 0 {form.created.qr.size} {form.created.qr.size}"
          role="img"
          aria-label={m.qrTitle(form.created.audience)}
          shape-rendering="crispEdges"
        >
          <rect width="100%" height="100%" fill="#fff" />
          <path d={form.created.qr.path} fill="#000" />
        </svg>
        <figcaption>
          <strong>{form.created.audience}</strong>
          <span class="muted">{m.qrHelp}</span>
          <span class="qr-tools">
            <IconButton icon="print" label={m.print.label} tip={m.print.tip} onclick={() => window.print()} />
            <IconButton
              icon="download"
              label={m.download.label}
              tip={m.download.tip}
              href={qrFile(form.created.qr)}
              download="qr-{form.created.audience}.svg"
            />
          </span>
        </figcaption>
      </figure>
    </div>
    <p class="visually-hidden" aria-live="polite">{copied ? m.copiedSaid : ""}</p>
  </section>
{/if}

<section class="card create" aria-labelledby="nouveau-lien">
  <h2 id="nouveau-lien">{m.new}</h2>
  {#if createValues?.error}
    <p class="notice error" role="alert">
      {m.errors[createValues.error] ?? m.failed}
    </p>
  {/if}
  {#if data.targets.length === 0}
    <p class="muted">{m.nothing}</p>
  {:else}
    <form
      method="POST"
      action="?/create"
      use:enhance={() => {
        copied = false;
        return async ({ update }) => update();
      }}
    >
      <div class="fields">
        <div class="wide">
          <label for="cible">{m.target}</label>
          <select id="cible" name="target" required>
            {#each data.targets as target (target.value)}
              <option value={target.value} selected={(createValues?.target ?? data.preset) === target.value}>
                {target.label}
              </option>
            {/each}
          </select>
        </div>
        <div>
          <label for="pour">{m.audience}</label>
          <input
            id="pour"
            name="audience"
            required
            maxlength="60"
            placeholder={m.audiencePlaceholder}
            value={createValues?.audience ?? ""}
            aria-invalid={createValues?.error === "invalid_audience" ? "true" : undefined}
          />
        </div>
        <div>
          <label for="fin">{m.until}</label>
          <input
            id="fin"
            name="expires"
            type="date"
            value={createValues?.expires ?? ""}
            aria-describedby="fin-aide"
            aria-invalid={createValues?.error === "invalid_expires" ? "true" : undefined}
          />
          <p id="fin-aide" class="muted help">{m.untilHelp}</p>
        </div>
      </div>
      <button type="submit">{m.create}</button>
    </form>
  {/if}
</section>

<div role="status" class="visually-hidden">
  {#if form && "revoke" in form && form.revoke && "audience" in form.revoke}{m.revoked(
      form.revoke.audience,
    )}{/if}
</div>
{#if form && "revoke" in form && form.revoke && "error" in form.revoke}
  <p class="notice error" role="alert">{m.revokeFailed}</p>
{/if}

<section aria-labelledby="actifs">
  <h2 id="actifs">{m.active(active.length)}</h2>
  {#if active.length === 0}
    <p class="muted">{m.none}</p>
  {:else}
    <ul class="links">
      {#each active as link (link.id)}
        <li class="card link">
          <div class="text">
            <h3>{link.audience}</h3>
            <p class="muted meta">
              {targetOf(link)} · {m.created(day(link.createdAt))}{link.expiresAt
                ? ` · ${m.expires(day(link.expiresAt))}`
                : ""}
            </p>
          </div>
          <details class="revoke">
            <summary>{m.revoke}</summary>
            <form method="POST" action="?/revoke" use:enhance>
              <input type="hidden" name="id" value={link.id} />
              <p>{m.revokeHelp(link.audience)}</p>
              <button type="submit" class="accent">{m.revokeFor(link.audience)}</button>
            </form>
          </details>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if ended.length > 0}
  <details class="ended">
    <summary>{m.ended(ended.length)}</summary>
    <ul class="links">
      {#each ended as link (link.id)}
        <li class="card link">
          <div class="text">
            <h3>{link.audience}</h3>
            <p class="muted meta">
              {targetOf(link)} · {link.revokedAt ? m.revokedOn(day(link.revokedAt)) : m.expired}
            </p>
          </div>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .intro {
    margin: -0.25rem 0 1.5rem;
  }
  .created {
    border: 2px solid var(--action);
    margin-bottom: 1.5rem;
  }
  .created input {
    font-size: 0.95rem;
  }
  .created-body {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    gap: 1rem 1.5rem;
  }
  .created-link {
    flex: 1 1 18rem;
    min-width: 0;
  }
  .actions :global(.icon) {
    margin-right: 0.4rem;
  }
  /* The code on white whatever the theme: a phone reads dark on light */
  .qr {
    flex: 0 1 16rem;
    margin: 0.75rem 0 0;
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: #fff;
    color: #1f2430;
    text-align: center;
  }
  .qr[hidden] {
    display: none;
  }
  .qr svg {
    display: block;
    width: 100%;
    max-width: 14rem;
    height: auto;
    margin: 0 auto;
  }
  .qr figcaption {
    display: grid;
    gap: 0.2rem;
    margin-top: 0.5rem;
  }
  .qr figcaption .muted {
    color: #5b6170;
    font-size: 0.9rem;
  }
  .qr-tools {
    display: flex;
    justify-content: center;
    gap: 0.5rem;
    margin-top: 0.6rem;
  }
  /* Printing the page prints the code alone, big, with the person's name */
  @media print {
    :global(body *) {
      visibility: hidden;
    }
    .qr,
    .qr :global(*) {
      visibility: visible;
    }
    .qr {
      position: absolute;
      inset: 0 auto auto 0;
      width: 100%;
      border: 0;
    }
    .qr svg {
      max-width: 12cm;
    }
    .qr-tools {
      display: none;
    }
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.75rem;
  }
  .create {
    margin-bottom: 2rem;
  }
  .fields {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
    margin-bottom: 1rem;
  }
  .wide {
    grid-column: 1 / -1;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 0;
  }
  .notice {
    margin: 0 0 1rem;
  }
  .links {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
    display: grid;
    gap: 0.75rem;
  }
  .link {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .text {
    flex: 1 1 16rem;
    min-width: 0;
  }
  h3 {
    font-size: 1.15rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .meta {
    margin: 0.25rem 0 0;
  }
  summary {
    min-height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
  }
  .revoke summary {
    padding: 0 1rem;
    border: 2px solid var(--border);
    border-radius: 10px;
  }
  .revoke[open] {
    flex-basis: 100%;
  }
  .revoke form {
    margin-top: 0.75rem;
  }
  @media (max-width: 30rem) {
    .fields {
      grid-template-columns: 1fr;
    }
  }
</style>
