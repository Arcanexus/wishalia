<script lang="ts">
  import { resolve } from "$app/paths";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";
  import ListBadge from "@wishalia/ui/ListBadge.svelte";

  import type { List } from "./types.ts";

  /** The list's picture in its settings, with the way to its page (docs/list-pictures.md). */
  let { list }: { list: List } = $props();

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).listPicture);
</script>

<section class="part" aria-labelledby="liste-image-titre">
  <h3 id="liste-image-titre">{m.heading}</h3>
  <p>{m.help}</p>
  <div class="picture">
    <ListBadge picture={list} size="small" />
    <a class="button secondary" href={resolve("/(app)/listes/[id]/icone", { id: list.id })}>{m.open}</a>
  </div>
</section>

<style>
  .part {
    border-top: 1px solid var(--border);
    margin-top: 1.25rem;
    padding-top: 0.5rem;
  }
  h3 {
    font-size: 1.1rem;
    margin: 0.5rem 0;
  }
  .picture {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
  }
</style>
