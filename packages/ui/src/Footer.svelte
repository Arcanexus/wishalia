<script lang="ts">
  import { commonMessages } from "@wishalia/i18n/messages/common";

  import Icon from "./Icon.svelte";
  import { useI18n } from "./i18n.ts";

  /**
   * The foot of every page of both frontends: a link to the user guide, for help, and the
   * version that runs (docs/user-guide.md).
   */
  let { version, help }: { version: string; help: string } = $props();
  const i18n = useI18n();
  const m = $derived(commonMessages(i18n.locale).footer);
</script>

<footer class="foot">
  <a href={help} target="_blank" rel="noopener noreferrer">
    <Icon name="help" />{m.help}<span class="visually-hidden">{m.helpNewTab}</span>
  </a>
  <span class="muted">{m.version(version)}</span>
</footer>

<style>
  .foot {
    max-width: 64rem;
    margin: 2rem auto 0;
    padding: 1rem;
    border-top: 1px solid var(--border);
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
  }
  a {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    min-height: 48px;
  }
</style>
