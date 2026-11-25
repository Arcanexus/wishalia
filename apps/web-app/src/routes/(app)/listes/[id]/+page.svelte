<script lang="ts">
  import { onDestroy, tick } from "svelte";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { page } from "$app/state";
  import { cents, formatAmount } from "@wishalia/domain";

  import Gifts from "#lib/Gifts.svelte";
  import ItemEditor from "#lib/ItemEditor.svelte";
  import ListSettings from "#lib/ListSettings.svelte";
  import QuickAdd from "#lib/QuickAdd.svelte";
  import ReloadButton from "#lib/ReloadButton.svelte";
  import { dropIndex, moveId, placeLine } from "#lib/reorder.ts";
  import type { Item } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const open = $derived(data.items.filter((item) => item.status === "open"));
  const images = $derived(data.me.features?.images ?? false);
  const byId = $derived(new Map(open.map((item) => [item.id, item])));

  // While the worker completes items from their links, the page looks again: every 3 seconds for
  // the first minute, then every 15 seconds up to 10 minutes (a link tried again waits in the
  // queue). It never polls without a reason.
  const completing = $derived(open.some((item) => item.enrichment === "pending"));
  let polls = 0;
  // Asking to read links again starts the looking over
  let refreshes = $state(0);
  let timer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    void refreshes;
    if (!completing || polls >= 56 || order || dragging) return;
    timer = setTimeout(
      () => {
        polls += 1;
        void invalidateAll();
      },
      polls < 20 ? 3000 : 15000,
    );
    return () => clearTimeout(timer);
  });
  onDestroy(() => clearTimeout(timer));

  // The order on screen while an item moves, before the server confirms it (optimistic)
  let order = $state<string[] | null>(null);
  let dragging = $state<string | null>(null);
  let moved = $state("");
  let list = $state<HTMLUListElement>();
  let orderForm = $state<HTMLFormElement>();
  const shown = $derived(order ? order.flatMap((id) => byId.get(id) ?? []) : open);

  const place = (id: string, ids: string[]) => {
    const item = byId.get(id);
    moved = item ? placeLine(item.title, ids.indexOf(id) + 1, ids.length) : "";
  };

  /** After the server answered: its order is the truth, also when it refused (the list changed). */
  const settle =
    (focus?: { id: string; direction: string }) =>
    async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      order = null;
      if (!focus) return;
      // A moved node loses the focus, and the arrow is gone at the top or the bottom: keep the
      // keyboard on the item, on the arrow that still goes somewhere
      await tick();
      const li = list?.querySelector(`li[data-id="${focus.id}"]`);
      const same = li?.querySelector<HTMLButtonElement>(`button[value="${focus.direction}"]`);
      const other = li?.querySelector<HTMLButtonElement>(
        `button[name="direction"]:not([value="${focus.direction}"])`,
      );
      (same && !same.disabled ? same : other)?.focus();
    };

  /** Drag by the handle, with a mouse, a pen or a finger; the arrows do the same in one tap. */
  function drag(event: PointerEvent, id: string) {
    if (event.button !== 0 || !list) return;
    event.preventDefault();
    const handle = event.currentTarget as HTMLElement;
    handle.setPointerCapture(event.pointerId);
    const before = shown.map((item) => item.id);
    order = before;
    dragging = id;
    const follow = (move: PointerEvent) => {
      const others = [...(list?.querySelectorAll<HTMLElement>(":scope > li") ?? [])].filter(
        (li) => li.dataset.id !== id,
      );
      const middles = others.map((li) => {
        const box = li.getBoundingClientRect();
        return box.top + box.height / 2;
      });
      const next = moveId(order ?? before, id, dropIndex(middles, move.clientY));
      if (next.join() !== (order ?? before).join()) order = next;
      // Near the edges, the page scrolls along
      if (move.clientY < 64) window.scrollBy(0, -16);
      else if (move.clientY > window.innerHeight - 64) window.scrollBy(0, 16);
    };
    const drop = async (end: PointerEvent) => {
      handle.removeEventListener("pointermove", follow);
      handle.removeEventListener("pointerup", drop);
      handle.removeEventListener("pointercancel", drop);
      dragging = null;
      if (end.type === "pointercancel" || !order || order.join() === before.join()) {
        order = null;
        return;
      }
      place(id, order);
      await tick();
      orderForm?.requestSubmit();
    };
    handle.addEventListener("pointermove", follow);
    handle.addEventListener("pointerup", drop);
    handle.addEventListener("pointercancel", drop);
  }
  const closed = $derived(data.items.filter((item) => item.status !== "open"));

  /** After a « Recharger »: the page shows « Lecture du lien… » and looks again, from the start. */
  const reread =
    () =>
    async ({ update }: { update: (options?: { reset?: boolean }) => Promise<void> }) => {
      await update({ reset: false });
      polls = 0;
      refreshes += 1;
    };
  const linked = $derived(open.some((item) => webLink(item) !== null));
  const refreshError = $derived(
    form?.refresh && "error" in form.refresh
      ? form.refresh.error === "rate_limited"
        ? "Vous avez demandé beaucoup de rechargements d'un coup : réessayez dans une minute."
        : "Le rechargement n'a pas pu être demandé. Réessayez dans un instant."
      : null,
  );

  /** Only web links become links: never a javascript: or data: address from an old item. */
  const webLink = (item: Item) => (item.url && /^https?:\/\//i.test(item.url) ? item.url : null);
  const kindLine = (item: Item) =>
    item.kind === "pool"
      ? item.targetCents
        ? `Cagnotte, objectif ${formatAmount(cents(item.targetCents)).replace(/,00(?=\s*€)/u, "")}`
        : "Cagnotte"
      : item.kind === "quantity"
        ? `${item.quantity ?? 1} exemplaire${(item.quantity ?? 1) > 1 ? "s" : ""}`
        : item.repeatable
          ? "À chaque occasion"
          : null;
  const failedEdit = (item: Item) =>
    form?.edit && "error" in form.edit && form.edit.itemId === item.id
      ? { error: form.edit.error, values: form.edit.values }
      : null;
  const host = (url: string) => URL.parse(url)?.hostname.replace(/^www\./, "") ?? url;
</script>

<svelte:head>
  <title>{data.list.name} · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)")}>← Mes listes</a></p>
<div class="heading">
  <h1>{data.list.name}</h1>
  <div class="actions">
    {#if linked}
      <form method="POST" action="?/refreshAll" use:enhance={reread}>
        <ReloadButton label="Recharger les liens de la liste" tip="Recharger les liens" />
      </form>
    {/if}
    <a class="button secondary" href={resolve("/(app)/listes/[id]/apercu", { id: data.list.id })}>Aperçu</a>
    <a class="button secondary" href="{resolve('/(app)/partage')}?liste={data.list.id}">
      Partager cette liste
    </a>
  </div>
</div>

{#if page.url.searchParams.has("importees")}
  {@const added = Number(page.url.searchParams.get("importees")) || 0}
  {@const twice = Number(page.url.searchParams.get("doublons")) || 0}
  <p class="notice" role="status">
    {added === 0
      ? "Aucune envie importée"
      : added === 1
        ? "1 envie importée"
        : `${added} envies importées`}{twice > 0
      ? `, ${twice === 1 ? "1 lien était" : `${twice} liens étaient`} déjà dans la liste`
      : ""}. Les titres et les prix se complètent tout seuls depuis les liens.
  </p>
{/if}

{#if refreshError}
  <p class="notice error" role="alert">{refreshError}</p>
{:else if form?.refresh && "queued" in form.refresh}
  {@const queued = form.refresh.queued}
  <p class="notice" role="status">
    {queued === 0
      ? "Aucun lien à recharger : les envies sans lien ou déjà en lecture ne changent pas."
      : `${queued === 1 ? "1 envie va être rechargée" : `${queued} envies vont être rechargées`} depuis ${
          queued === 1 ? "son lien" : "leur lien, l'une après l'autre"
        }.`}
    Le titre et le prix suivent la page tant que vous ne les avez pas changés ; ce que vous avez saisi ou envoyé
    vous-même est gardé.
  </p>
{/if}

<ListSettings list={data.list} {form} />

<QuickAdd listName={data.list.name} result={form?.add ?? null} />

<div role="status" class="visually-hidden">
  {#if moved}
    {moved}
  {:else if form?.move && "title" in form.move}
    {placeLine(form.move.title, form.move.position, form.move.count)}
  {:else if form?.settings && "saved" in form.settings}
    Réglages de la liste enregistrés.
  {:else if form?.reveal && "lifted" in form.reveal}
    Le secret de la liste est levé.
  {:else if form?.refresh && "itemId" in form.refresh && "title" in form.refresh}
    Rechargement de « {form.refresh.title} » demandé.
  {:else if form?.edit && "title" in form.edit}
    « {form.edit.title} » est enregistré{form.edit.listId !== data.list.id ? " et a changé de liste" : ""}.
  {:else if form?.status && "status" in form.status}
    « {form.status.title} » : {form.status.status === "received"
      ? "reçu"
      : form.status.status === "archived"
        ? "archivé"
        : "remis dans la liste"}.
  {/if}
</div>

<section aria-labelledby="envies-titre">
  <h2 id="envies-titre">Envies ({open.length})</h2>
  {#if open.length === 0}
    <p class="muted">Aucune envie pour le moment. Ajoutez-en une ci-dessus.</p>
  {:else}
    {#if form?.move && "error" in form.move}
      <p class="notice error" role="alert">
        L'ordre n'a pas pu être enregistré : la liste a changé entre-temps. Voici l'ordre actuel.
      </p>
    {/if}
    <form method="POST" action="?/order" bind:this={orderForm} use:enhance={() => settle()} hidden>
      {#each order ?? [] as id (id)}<input type="hidden" name="itemIds" value={id} />{/each}
    </form>
    <ul class="items" bind:this={list}>
      {#each shown as item, index (item.id)}
        {@const link = webLink(item)}
        <li class="card item sortable" class:dragging={dragging === item.id} data-id={item.id}>
          {#if shown.length > 1}
            <form
              method="POST"
              action="?/move"
              class="mover"
              use:enhance={({ formData }) => {
                const direction = String(formData.get("direction"));
                const ids = shown.map((entry) => entry.id);
                const next = moveId(ids, item.id, index + (direction === "up" ? -1 : 1));
                order = next;
                place(item.id, next);
                return settle({ id: item.id, direction });
              }}
            >
              <input type="hidden" name="itemId" value={item.id} />
              <button
                type="submit"
                name="direction"
                value="up"
                class="secondary"
                disabled={index === 0}
                aria-label="Monter « {item.title} »"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 15l6-6 6 6" /></svg>
              </button>
              <span
                class="grip"
                aria-hidden="true"
                title="Glisser pour déplacer"
                onpointerdown={(event) => drag(event, item.id)}
              >
                <svg viewBox="0 0 24 24">
                  {#each [6, 12, 18] as y (y)}<circle cx="9" cy={y} r="1.6" /><circle
                      cx="15"
                      cy={y}
                      r="1.6"
                    />{/each}
                </svg>
              </span>
              <button
                type="submit"
                name="direction"
                value="down"
                class="secondary"
                disabled={index === shown.length - 1}
                aria-label="Descendre « {item.title} »"
              >
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9l6 6 6-6" /></svg>
              </button>
            </form>
          {/if}
          {#if !item.image && images && item.enrichment === "pending"}
            <!-- Its image may come with the link: a place kept for it, that breathes while it waits -->
            <span class="thumb waiting" aria-hidden="true"></span>
          {:else if item.image}
            <!-- The name next to it says what it is: decorative for a screen reader -->
            <img
              class="thumb"
              src={item.image.small}
              alt=""
              width="192"
              height="192"
              loading="lazy"
              decoding="async"
            />
          {/if}
          <div class="body">
            <div class="text">
              <h3>{item.title}</h3>
              <p class="muted meta">
                {#if kindLine(item)}<span class="kind">{kindLine(item)}</span>{/if}
                {#if item.priceCents !== null}<span>{formatAmount(cents(item.priceCents))}</span>{/if}
                {#if link}
                  <a href={link} rel="noopener noreferrer external" target="_blank">
                    {host(link)}<span class="visually-hidden"> (nouvel onglet)</span>
                  </a>
                {/if}
              </p>
              {#if item.notes}<p class="notes">{item.notes}</p>{/if}
              {#if item.enrichment === "pending"}
                <p class="completing">
                  <span class="reading">
                    <!-- A circle that turns while the worker reads the page (still with reduced motion) -->
                    <svg class="spinner" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
                      <circle class="track" cx="12" cy="12" r="9" fill="none" stroke-width="3" />
                      <path
                        class="arc"
                        d="M12 3a9 9 0 0 1 9 9"
                        fill="none"
                        stroke-width="3"
                        stroke-linecap="round"
                      />
                    </svg>
                    Lecture du lien…
                  </span>
                  <span class="muted">
                    Le titre, le prix{images ? " et les images" : ""} arrivent depuis la page.
                  </span>
                </p>
              {:else if item.enrichment === "failed"}
                <p class="completing">
                  <span class="badge failed">Lien illisible</span>
                  <span class="muted">
                    La page n'a pas pu être lue : réessayez avec le bouton «&nbsp;Recharger&nbsp;» (les
                    flèches), ou complétez l'envie avec «&nbsp;Modifier&nbsp;».
                  </span>
                </p>
              {/if}
              {#if data.gifts[item.id]?.length}<Gifts gifts={data.gifts[item.id] ?? []} none="" />{/if}
            </div>
            <div class="actions">
              {#if images}
                <a
                  class="button secondary"
                  href={resolve("/(app)/listes/[id]/image/[itemId]", { id: data.list.id, itemId: item.id })}
                  aria-label="Image de « {item.title} »"
                >
                  Image
                </a>
              {/if}
              {#if link && item.enrichment !== "pending"}
                <form method="POST" action="?/refresh" use:enhance={reread}>
                  <input type="hidden" name="itemId" value={item.id} />
                  <ReloadButton label="Recharger le lien de « {item.title} »" tip="Recharger" />
                </form>
              {/if}
              <form method="POST" action="?/status" use:enhance>
                <input type="hidden" name="itemId" value={item.id} />
                <button type="submit" name="status" value="received" aria-label="J'ai reçu « {item.title} »">
                  Reçu
                </button>
              </form>
              <form method="POST" action="?/status" use:enhance>
                <input type="hidden" name="itemId" value={item.id} />
                <button
                  type="submit"
                  name="status"
                  value="archived"
                  class="secondary"
                  aria-label="Archiver « {item.title} »"
                >
                  Archiver
                </button>
              </form>
            </div>
            <ItemEditor {item} lists={data.lists} failed={failedEdit(item)} />
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if closed.length > 0}
  <details class="closed">
    <summary>Reçues et archivées ({closed.length})</summary>
    <ul class="items">
      {#each closed as item (item.id)}
        <li class="card item">
          <div class="text">
            <h3>{item.title}</h3>
            <p class="muted meta">{item.status === "received" ? "Reçu" : "Archivé"}</p>
            {#if data.gifts[item.id]}
              <Gifts
                gifts={data.gifts[item.id] ?? []}
                none="Personne ne l'a offert en dehors des événements."
              />
            {/if}
          </div>
          <form method="POST" action="?/status" use:enhance class="actions">
            <input type="hidden" name="itemId" value={item.id} />
            <button
              type="submit"
              name="status"
              value="open"
              class="secondary"
              aria-label="Remettre « {item.title} » dans la liste"
            >
              Remettre dans la liste
            </button>
          </form>
        </li>
      {/each}
    </ul>
  </details>
{/if}

<style>
  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-bottom: 1rem;
  }
  .heading h1 {
    margin: 0;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .back {
    margin: 0 0 0.5rem;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 0;
    display: grid;
    gap: 0.75rem;
  }
  .item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .sortable {
    flex-wrap: nowrap;
    align-items: flex-start;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .mover {
    flex: none;
    margin-left: -0.5rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    align-self: flex-start;
  }
  .mover button {
    min-height: 2.5rem;
    width: 2.75rem;
    padding: 0;
    display: grid;
    place-items: center;
  }
  .mover button:disabled {
    visibility: hidden;
  }
  .mover svg {
    width: 1.4rem;
    height: 1.4rem;
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .grip {
    display: grid;
    place-items: center;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 8px;
    color: var(--text-2);
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .grip:hover {
    background: var(--surface-2, var(--border));
  }
  .grip svg {
    fill: currentColor;
    stroke: none;
  }
  .dragging {
    border-color: var(--action);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.25);
    position: relative;
    z-index: 1;
  }
  .dragging .grip {
    cursor: grabbing;
  }
  .thumb {
    flex: none;
    width: 4.5rem;
    height: 4.5rem;
    object-fit: cover;
    border-radius: 10px;
    background: var(--border);
  }
  @media (min-width: 40rem) {
    .thumb {
      width: 6rem;
      height: 6rem;
    }
  }
  .text {
    flex: 1 1 14rem;
    min-width: 0;
  }
  h3 {
    font-size: 1.15rem;
    margin: 0;
    overflow-wrap: anywhere;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem 1rem;
    margin: 0.25rem 0 0;
  }
  .kind {
    color: var(--text);
    font-weight: 600;
  }
  .completing {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.25rem 0.5rem;
    margin: 0.5rem 0 0;
    font-size: 0.95rem;
  }
  /* « Lecture du lien »: seen at a glance, by a turning icon and its words, not by colour alone */
  .reading {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .spinner {
    flex: none;
    animation: turn 0.9s linear infinite;
  }
  .track {
    stroke: var(--border);
  }
  .arc {
    stroke: var(--progress);
  }
  @keyframes turn {
    to {
      transform: rotate(360deg);
    }
  }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    border: 1px solid currentColor;
    border-radius: 999px;
    padding: 0.1rem 0.6rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .failed {
    color: var(--text-2);
    border-style: dashed;
  }
  .waiting {
    display: block;
    border: 2px dashed var(--progress);
    background: transparent;
    animation: breathe 1.4s ease-in-out infinite;
  }
  @keyframes breathe {
    50% {
      opacity: 0.35;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner,
    .waiting {
      animation: none;
    }
  }
  .notes {
    margin: 0.5rem 0 0;
    white-space: pre-line;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .closed {
    margin-top: 2rem;
  }
  summary {
    min-height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
  }
  .closed .items {
    margin-top: 0.75rem;
  }
</style>
