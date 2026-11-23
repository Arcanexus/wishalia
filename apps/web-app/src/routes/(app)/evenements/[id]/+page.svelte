<script lang="ts">
  import { enhance } from "$app/forms";
  import { resolve } from "$app/paths";
  import { cents, formatAmount } from "@wishalia/domain";

  import EventFields from "#lib/EventFields.svelte";
  import { eventKindLabel, formatAvailable, formatDay } from "#lib/format.ts";
  import type { Gift } from "#lib/types.ts";

  import type { PageProps } from "./$types";

  let { data, form }: PageProps = $props();

  const event = $derived(data.event);
  const titles = $derived(
    new Map(
      [...data.selected, ...data.choices.flatMap((group) => group.items)].map((item) => [
        item.id,
        item.title,
      ]),
    ),
  );

  // What was typed, after a refusal of the settings form; the event otherwise
  type Values = { name: string; kind: string; date: string; revealDelayDays: string | number };
  const typedValues = $derived(
    form?.update && "kind" in form.update ? (form.update as unknown as Values) : (event as Values),
  );

  const describe = (gift: Gift) => {
    const what =
      gift.amountCents !== null
        ? formatAmount(cents(gift.amountCents))
        : gift.units !== null && gift.units > 1
          ? `${gift.units} exemplaires`
          : "l'a offert";
    return `${gift.name ?? "Quelqu'un (anonyme)"} : ${what}`;
  };

  const errors: Record<string, string> = {
    too_early: "Il est encore trop tôt pour lever le secret.",
    confirm: "Cochez la case pour confirmer.",
    not_found: "Cette envie n'est plus disponible. Rechargez la page.",
  };
</script>

<svelte:head>
  <title>{event.name} · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)/evenements")}>← Événements</a></p>
<h1>{event.name}</h1>
<p class="muted when">{eventKindLabel(event.kind)} · {formatDay(event.date)}</p>

<section class="card secret" aria-labelledby="secret-titre">
  <h2 id="secret-titre">Le secret</h2>
  {#if event.secretLifted}
    <p>Le secret est levé : vous voyez ci-dessous qui vous a offert quoi.</p>
  {:else if event.canReveal}
    <p>
      Les cadeaux de cet événement restent secrets tant que vous ne levez pas le secret. Une fois levé, vous
      voyez qui a offert quoi, et ce choix est définitif.
    </p>
    <form method="POST" action="?/reveal" use:enhance>
      <label class="check">
        <input type="checkbox" name="confirm" value="oui" required />
        <span>Je veux voir qui m'a offert quoi</span>
      </label>
      <button type="submit" class="accent">Lever le secret</button>
    </form>
  {:else}
    <p>
      Ce qu'on vous offre reste secret. Vous pourrez lever le secret à partir du
      <strong>{formatAvailable(event.revealAvailableAt)}</strong>.
    </p>
  {/if}
  {#if form?.reveal && "error" in form.reveal}
    <p class="notice error" role="alert">{errors[form.reveal.error] ?? errors.too_early}</p>
  {/if}
</section>

<div role="status" class="visually-hidden">
  {#if form?.items && "added" in form.items}« {titles.get(form.items.added) ?? "L'envie"} » est ajoutée à l'événement.{/if}
  {#if form?.items && "removed" in form.items}« {titles.get(form.items.removed) ?? "L'envie"} » est retirée de l'événement.{/if}
  {#if form?.update && "saved" in form.update}Réglages enregistrés.{/if}
</div>
{#if form?.items && "error" in form.items}
  <p class="notice error" role="alert">
    {errors[form.items.error] ?? "Le changement n'a pas abouti. Réessayez."}
  </p>
{/if}

<section aria-labelledby="choisies-titre">
  <h2 id="choisies-titre">Envies de l'événement ({data.selected.length})</h2>
  {#if data.selected.length === 0}
    <p class="muted">Aucune envie pour l'instant. Choisissez-en ci-dessous, dans vos listes.</p>
  {:else}
    <ul class="items">
      {#each data.selected as item (item.id)}
        {@const gifts = data.gifts[item.id]}
        <li class="card item">
          <div class="text">
            <h3>{item.title}</h3>
            {#if item.priceCents !== null}<p class="muted meta">
                {formatAmount(cents(item.priceCents))}
              </p>{/if}
            {#if gifts}
              {#if gifts.length === 0}
                <p class="muted meta">Personne ne l'a offert pour cet événement.</p>
              {:else}
                <ul class="gifts">
                  {#each gifts as gift, index (index)}<li>{describe(gift)}</li>{/each}
                </ul>
              {/if}
            {/if}
          </div>
          <form method="POST" action="?/removeItem" use:enhance>
            <input type="hidden" name="itemId" value={item.id} />
            <button type="submit" class="secondary" aria-label="Retirer « {item.title} » de l'événement">
              Retirer
            </button>
          </form>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if data.choices.length > 0}
  <section aria-labelledby="ajouter-titre" class="choices">
    <h2 id="ajouter-titre">Ajouter des envies</h2>
    {#each data.choices as group (group.list.id)}
      <h3 class="list-name">{group.list.name}</h3>
      <ul class="items">
        {#each group.items as item (item.id)}
          <li class="card item compact">
            <span class="title">{item.title}</span>
            <form method="POST" action="?/addItem" use:enhance>
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit" aria-label="Ajouter « {item.title} » à l'événement">Ajouter</button>
            </form>
          </li>
        {/each}
      </ul>
    {/each}
  </section>
{/if}

<details class="card settings" open={Boolean(form?.update && "error" in form.update)}>
  <summary>Réglages de l'événement</summary>
  <form
    method="POST"
    action="?/update"
    use:enhance={() =>
      async ({ update }) =>
        update({ reset: false })}
  >
    <input type="hidden" name="frozen" value={event.secretLifted ? "1" : "0"} />
    <EventFields
      values={typedValues}
      error={form?.update && "error" in form.update ? form.update.error : null}
      frozen={event.secretLifted}
    />
    <button type="submit">Enregistrer</button>
  </form>
</details>

<style>
  .back {
    margin: 0 0 0.5rem;
  }
  .when {
    margin-top: -0.25rem;
  }
  .secret {
    margin: 1.5rem 0 2rem;
  }
  .secret p {
    margin-top: 0;
  }
  .check {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 48px;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }
  .check input {
    width: 1.5rem;
    min-height: 1.5rem;
    height: 1.5rem;
    accent-color: var(--action);
  }
  .items {
    list-style: none;
    padding: 0;
    margin: 0 0 1.5rem;
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
  .compact {
    padding: 0.75rem 1rem;
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
  .title {
    flex: 1 1 12rem;
    overflow-wrap: anywhere;
  }
  .list-name {
    color: var(--text-2);
    margin: 1rem 0 0.5rem;
  }
  .meta {
    margin: 0.25rem 0 0;
  }
  .gifts {
    margin: 0.5rem 0 0;
    padding-left: 1.2rem;
  }
  .settings {
    margin-top: 2rem;
  }
  summary {
    min-height: 48px;
    display: flex;
    align-items: center;
    cursor: pointer;
    font-weight: 600;
  }
  .settings form {
    margin-top: 1rem;
  }
  .notice {
    margin: 0 0 1rem;
  }
</style>
