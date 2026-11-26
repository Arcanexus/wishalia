<script lang="ts">
  import { untrack } from "svelte";
  import Gifts from "#lib/Gifts.svelte";
  import { enhance } from "$app/forms";
  import { invalidateAll } from "$app/navigation";
  import { resolve } from "$app/paths";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import { autosave, type SaveState } from "#lib/autosave.ts";
  import EventFields from "#lib/EventFields.svelte";
  import SaveStatus from "#lib/SaveStatus.svelte";

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

  const i18n = useI18n();
  const all = $derived(appMessages(i18n.locale));
  const m = $derived(all.event);

  // Saved as it changes (docs/management-app.md, « Saved as you go »); the fields start once, so
  // that a reload after a save never overwrites what is being typed
  const startValues = untrack(() => typedValues);
  let saveState = $state<SaveState>(
    untrack(() => (form?.update && "error" in form.update ? "error" : "idle")),
  );
  let updateError = $state<string | null>(
    untrack(() => (form?.update && "error" in form.update ? String(form.update.error) : null)),
  );
</script>

<svelte:head>
  <title>{event.name} · {data.appName}</title>
</svelte:head>

<p class="back"><a href={resolve("/(app)/evenements")}>{m.back}</a></p>
<div class="heading">
  <div>
    <h1>{event.name}</h1>
    <p class="muted when">{all.eventKinds[event.kind]} · {i18n.fmt.day(event.date)}</p>
  </div>
  <a class="button secondary" href="{resolve('/(app)/partage')}?evenement={event.id}">
    {m.share}
  </a>
</div>

<section class="card secret" aria-labelledby="secret-titre">
  <h2 id="secret-titre">{m.secret}</h2>
  {#if event.secretLifted}
    <p>{m.lifted}</p>
  {:else if event.canReveal}
    <p>{m.liftHelp}</p>
    <form method="POST" action="?/reveal" use:enhance>
      <label class="check">
        <input type="checkbox" name="confirm" value="oui" required />
        <span>{m.liftConfirm}</span>
      </label>
      <button type="submit" class="accent">{m.lift}</button>
    </form>
  {:else}
    <p>{m.kept}<strong>{i18n.fmt.date(event.revealAvailableAt)}</strong>.</p>
  {/if}
  {#if form?.reveal && "error" in form.reveal}
    <p class="notice error" role="alert">{m.errors[form.reveal.error] ?? m.errors.too_early}</p>
  {/if}
</section>

<div role="status" class="visually-hidden">
  {#if form?.items && "added" in form.items}{m.added(titles.get(form.items.added) ?? m.theWish)}{/if}
  {#if form?.items && "removed" in form.items}{m.removed(titles.get(form.items.removed) ?? m.theWish)}{/if}
  {#if form?.update && "saved" in form.update}{m.saved}{/if}
</div>
{#if form?.items && "error" in form.items}
  <p class="notice error" role="alert">
    {m.errors[form.items.error] ?? m.failed}
  </p>
{/if}

<section aria-labelledby="choisies-titre">
  <h2 id="choisies-titre">{m.wishes(data.selected.length)}</h2>
  {#if data.selected.length === 0}
    <p class="muted">{m.none}</p>
  {:else}
    <ul class="items">
      {#each data.selected as item (item.id)}
        {@const gifts = data.gifts[item.id]}
        <li class="card item">
          <div class="text">
            <h3>{item.title}</h3>
            {#if item.priceCents !== null}<p class="muted meta">
                {i18n.fmt.money(item.priceCents)}
              </p>{/if}
            {#if gifts}<Gifts {gifts} none={m.noGift} />{/if}
          </div>
          <form method="POST" action="?/removeItem" use:enhance>
            <input type="hidden" name="itemId" value={item.id} />
            <button type="submit" class="secondary" aria-label={m.removeLabel(item.title)}>
              {m.remove}
            </button>
          </form>
        </li>
      {/each}
    </ul>
  {/if}
</section>

{#if data.choices.length > 0}
  <section aria-labelledby="ajouter-titre" class="choices">
    <h2 id="ajouter-titre">{m.addWishes}</h2>
    {#each data.choices as group (group.list.id)}
      <h3 class="list-name">{group.list.name}</h3>
      <ul class="items">
        {#each group.items as item (item.id)}
          <li class="card item compact">
            <span class="title">{item.title}</span>
            <form method="POST" action="?/addItem" use:enhance>
              <input type="hidden" name="itemId" value={item.id} />
              <button type="submit" aria-label={m.addLabel(item.title)}>{m.add}</button>
            </form>
          </li>
        {/each}
      </ul>
    {/each}
  </section>
{/if}

<details class="card settings" open={Boolean(form?.update && "error" in form.update)}>
  <summary>{m.settings}</summary>
  <form
    method="POST"
    action="?/update"
    use:autosave={{
      onState: (state) => (saveState = state),
      onResult: async (result) => {
        if (result.type === "success") {
          updateError = null;
          await invalidateAll();
          return true;
        }
        updateError =
          result.type === "failure"
            ? String((result.data?.update as { error?: string } | undefined)?.error ?? "failed")
            : null;
        return false;
      },
    }}
  >
    <input type="hidden" name="frozen" value={event.secretLifted ? "1" : "0"} />
    <EventFields values={startValues} error={updateError} frozen={event.secretLifted} />
    <SaveStatus state={saveState} error={updateError ? all.autosave.refused : null} />
  </form>
</details>

<style>
  .back {
    margin: 0 0 0.5rem;
  }
  .heading {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1rem;
  }
  .when {
    margin: 0;
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
