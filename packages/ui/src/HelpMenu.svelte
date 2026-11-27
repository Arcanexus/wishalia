<script lang="ts">
  /**
   * The help menu of the header (docs/user-guide.md): the user guide, then the parts of it the page
   * is about. Each opens the guide in a new tab, so that the page and what was typed stay.
   */
  import { commonMessages } from "@wishalia/i18n/messages/common";

  import { topicUrl, type HelpTopic } from "./help.ts";
  import { useI18n } from "./i18n.ts";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons.ts";
  import Menu from "./Menu.svelte";

  let { help, topics = [] }: { help: string; topics?: HelpTopic[] } = $props();

  const i18n = useI18n();
  const m = $derived(commonMessages(i18n.locale).help);
  const ICONS: Record<HelpTopic, IconName> = {
    add: "plus",
    order: "list",
    share: "share",
    surprise: "eye",
    occasions: "calendar",
    give: "gift",
    display: "device",
  };
</script>

<Menu icon="help" label={m.label}>
  <p class="menu-heading">{m.label}</p>
  <a class="menu-item" href={help} target="_blank" rel="noopener noreferrer">
    <Icon name="help" />{m.guide}<span class="mark"><Icon name="external" size="1.2rem" /></span><span
      class="visually-hidden"
    >
      {m.newTab}
    </span>
  </a>
  {#if topics.length > 0}
    <hr class="menu-separator" />
    <p class="menu-heading">{m.here}</p>
    {#each topics as topic (topic)}
      <a
        class="menu-item"
        href={topicUrl(help, m.topics[topic].heading)}
        target="_blank"
        rel="noopener noreferrer"
      >
        <Icon name={ICONS[topic]} />{m.topics[topic].label}<span class="visually-hidden">{m.newTab}</span>
      </a>
    {/each}
  {/if}
</Menu>
