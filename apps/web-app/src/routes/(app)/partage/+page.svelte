<script lang="ts">
  import { enhance } from "$app/forms";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

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
    <div class="actions">
      <button type="button" class="accent" onclick={() => copy(form.created.url)}>
        {copied ? m.copied : m.copy}
      </button>
      {#if canShare}
        <button
          type="button"
          class="secondary"
          onclick={() => navigator.share({ title: m.shareTitle, url: form.created.url }).catch(() => {})}
        >
          {m.send}
        </button>
      {/if}
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
