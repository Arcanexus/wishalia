<script lang="ts">
  /**
   * The other languages, one button each, named in their own language (docs/i18n.md). A plain form
   * to the frontend's /preferences, so it works before the page's JavaScript has loaded.
   */
  import { LOCALE_NAMES, LOCALES } from "@wishalia/i18n";
  import { commonMessages } from "@wishalia/i18n/messages/common";

  import { useI18n } from "./i18n.ts";

  let { returnPath }: { returnPath: string } = $props();
  const i18n = useI18n();
  const m = $derived(commonMessages(i18n.locale).language);
  const others = $derived(LOCALES.filter((locale) => locale !== i18n.locale));
</script>

<form method="POST" action="/preferences" class="languages">
  <input type="hidden" name="retour" value={returnPath} />
  <span class="visually-hidden">{m.label}</span>
  {#each others as locale (locale)}
    <button type="submit" class="secondary" name="langue" value={locale} lang={locale}>
      {LOCALE_NAMES[locale]}
    </button>
  {/each}
</form>

<style>
  .languages {
    display: inline-flex;
    gap: 0.5rem;
  }
</style>
