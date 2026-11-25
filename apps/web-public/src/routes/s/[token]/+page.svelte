<script lang="ts">
  import { enhance } from "$app/forms";
  import { page } from "$app/state";

  import Logo from "@wishalia/ui/Logo.svelte";
  import ModeButton from "@wishalia/ui/ModeButton.svelte";
  import EventGauge from "@wishalia/ui/public/EventGauge.svelte";
  import ItemCard from "@wishalia/ui/public/ItemCard.svelte";

  import GiveForm from "#lib/GiveForm.svelte";
  import { canGive, gauge, formatDay, heading, myGiftLine, withdrawError } from "@wishalia/ui/public/view.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();
  const view = $derived(data.view);
  const owner = $derived(view.owner.displayName);
  const openEvents = $derived(view.events.filter((event) => event.open));
  const eventsById = $derived(new Map(view.events.map((event) => [event.id, event])));
  /** The open events a gift can be for: on a list link, those of the item. */
  const giftEvents = (eventIds: string[]) =>
    view.scope === "event"
      ? []
      : eventIds.flatMap((id) => {
          const event = eventsById.get(id);
          return event?.open ? [event] : [];
        });
  const overall = $derived(view.viewer === "owner" || data.folded ? null : gauge(view.items));
  const shortDay = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", timeZone: "UTC" });
  const short = (date: string) => shortDay.format(new Date(`${date}T00:00:00Z`));
</script>

<svelte:head>
  <title>{data.meta.title}</title>
  <meta name="description" content={data.meta.description} />
  <meta property="og:title" content={data.meta["og:title"]} />
  <meta property="og:description" content={data.meta["og:description"]} />
  <meta property="og:type" content={data.meta["og:type"]} />
</svelte:head>

<header class="top">
  <div class="bar">
    <span class="brand"><Logo size={36} ring={false} /><span>{data.appName}</span></span>
    <ModeButton mode={data.mode} nextMode={data.nextMode} returnPath={page.url.pathname} />
  </div>
</header>

<main id="contenu" class="page">
  <p class="hello">{view.open ? "Bienvenue !" : `Bonjour ${view.audience} !`}</p>
  <h1 id="titre" tabindex="-1">{heading(view)}</h1>
  <p class="muted lead">
    {#if view.event}
      Les envies de {owner}, pour le {formatDay(view.event.date)}.
    {:else}
      Les envies de {owner}.
    {/if}
  </p>

  {#if view.viewer === "owner"}
    <div class="notice owner" role="note">
      <p>
        <strong>C'est votre propre lien.</strong> Vous voyez la liste comme vos proches, mais sans rien de ce qu'ils
        vous offrent : la surprise reste entière.
      </p>
    </div>
  {:else if data.folded}
    <section class="card fold" aria-labelledby="fold-title">
      <h2 id="fold-title">Vous n'êtes pas {owner} ?</h2>
      <p>
        Ce que vos proches offrent reste caché pour l'instant, au cas où cet appareil serait celui de {owner}.
        Dites-nous que ce n'est pas le cas, et vous verrez ce qui est déjà pris, et pourrez offrir à votre
        tour.
      </p>
      <form
        method="POST"
        action="?/unfold"
        use:enhance={() =>
          async ({ update }) => {
            await update();
            // The button is gone: bring the reader back to the top of the list
            document.getElementById("titre")?.focus();
          }}
      >
        <button type="submit">Je ne suis pas {owner}, voir les cadeaux</button>
      </form>
      <p class="muted small">Si vous êtes {owner}, ne cliquez pas : la surprise reste entière.</p>
    </section>
  {:else if view.event && !view.event.open}
    <p class="notice">Cet événement est passé : la liste reste à voir, mais on ne peut plus y participer.</p>
  {:else if openEvents.length > 0 && view.scope === "list"}
    <p class="muted">
      Prochaine{openEvents.length > 1 ? "s" : ""} occasion{openEvents.length > 1 ? "s" : ""} :
      {openEvents.map((event) => `${event.name} (${short(event.date)})`).join(", ")}.
    </p>
  {/if}

  {#if overall}
    <EventGauge gauge={overall} label={view.event ? "Où en est l'occasion" : "Où en est la liste"} />
  {/if}

  {#if view.items.length === 0}
    <p class="card empty">La liste est vide pour l'instant. Revenez un peu plus tard !</p>
  {:else}
    <ul class="items">
      {#each view.items as item (item.id)}
        <ItemCard {item} events={view.events} scope={view.scope}>
          {#each data.mine.filter((gift) => gift.itemId === item.id) as gift (gift.id)}
            <div class="mine">
              <p>
                <strong>{myGiftLine(gift, item)}</strong>
                {#if gift.eventId && view.scope === "list" && eventsById.get(gift.eventId)}
                  <span class="muted">Pour {eventsById.get(gift.eventId)?.name}.</span>
                {/if}
              </p>
              <form method="POST" action="?/withdraw" use:enhance>
                <input type="hidden" name="id" value={gift.id} />
                <button type="submit" class="secondary" aria-label="Me retirer de « {item.title} »">
                  Me retirer
                </button>
              </form>
              {#if form?.withdraw && "id" in form.withdraw && form.withdraw.id === gift.id}
                <p class="notice error" role="alert">{withdrawError(form.withdraw.error)}</p>
              {/if}
            </div>
          {/each}

          {#if form?.given?.itemId === item.id}
            <p class="notice thanks">
              Merci, c'est noté ! {owner} n'en saura rien avant l'occasion.
            </p>
          {/if}

          {#if !data.folded && canGive(item, view)}
            <GiveForm
              {item}
              events={giftEvents(item.eventIds)}
              {owner}
              needsName={view.me === null}
              guestName={data.guestName}
              failed={form?.give && form.give.itemId === item.id ? form.give : null}
            />
          {/if}
        </ItemCard>
      {/each}
    </ul>
  {/if}

  <div class="visually-hidden" role="status">
    {#if form?.given}Merci, c'est noté !{:else if form?.withdrawn}C'est retiré.{:else if form?.unfolded}Les
      cadeaux sont affichés.{/if}
  </div>

  {#if view.viewer !== "owner"}
    <p class="muted secret">
      Ce que vous offrez reste secret pour {owner}, jusqu'après l'occasion.
    </p>
  {/if}
</main>

<style>
  .top {
    background: var(--surface);
    border-bottom: 1px solid var(--border);
  }
  .bar {
    max-width: 48rem;
    margin: 0 auto;
    padding: 0.5rem 1rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.3rem;
  }
  .page {
    max-width: 48rem;
    margin: 0 auto;
    padding: 1.5rem 1rem 4rem;
  }
  .hello {
    font-weight: 600;
    margin: 0 0 0.25rem;
  }
  .lead {
    margin-top: 0;
  }
  .owner {
    margin-bottom: 1.5rem;
  }
  .owner p {
    margin: 0;
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 1.5rem 0;
    display: grid;
    gap: 1rem;
  }
  .mine {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
    margin-top: 0.75rem;
    padding: 0.75rem 1rem;
    border-radius: 10px;
    border: 2px solid var(--action);
  }
  .mine p {
    margin: 0;
  }
  .mine .notice {
    flex-basis: 100%;
  }
  .fold {
    margin: 1rem 0 1.5rem;
    border-width: 2px;
    border-color: var(--action);
  }
  .fold h2 {
    margin-top: 0;
  }
  .fold form {
    margin: 1rem 0 0.5rem;
  }
  .thanks {
    margin: 0.75rem 0 0;
  }
  .empty {
    margin: 1.5rem 0;
  }
  .secret {
    text-align: center;
    margin-top: 2rem;
  }
</style>
