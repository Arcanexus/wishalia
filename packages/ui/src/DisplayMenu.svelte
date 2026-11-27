<script lang="ts">
  /**
   * The display menu of the header (docs/branding.md): the size of the text, light, dark or as the
   * device, the theme, and the language. Each choice is a plain form to the frontend's /preferences, so it works
   * before the page's JavaScript has loaded; the one in use is pressed and ticked.
   */
  import { TEXT_SIZES, type ModeChoice, type TextSize, type ThemeChoice } from "@wishalia/domain";
  import { LOCALE_NAMES, LOCALES } from "@wishalia/i18n";
  import { commonMessages } from "@wishalia/i18n/messages/common";

  import { useI18n } from "./i18n.ts";
  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons.ts";
  import Menu from "./Menu.svelte";

  let {
    mode,
    theme,
    text = "normal",
    returnPath,
  }: {
    mode: ModeChoice;
    /** The size of the text on this device. */
    text?: TextSize;
    /** The person's theme; a list that forces its own still wins on its pages. */
    theme: ThemeChoice;
    returnPath: string;
  } = $props();

  const uid = $props.id();
  const i18n = useI18n();
  const m = $derived(commonMessages(i18n.locale).display);
  const MODES: [ModeChoice, IconName][] = [
    ["device", "device"],
    ["light", "sun"],
    ["dark", "moon"],
  ];
  const THEMES: ThemeChoice[] = ["auto", "neutral", "christmas"];
  const modeIcon = $derived(mode === "dark" ? "moon" : mode === "light" ? "sun" : "device");
</script>

<Menu icon={modeIcon} label={m.label}>
  <form method="POST" action="/preferences">
    <input type="hidden" name="retour" value={returnPath} />
    <p class="menu-heading" id="{uid}-texte">{m.text}</p>
    <!-- Three « A », each drawn at the size it gives -->
    <div class="sizes" role="group" aria-labelledby="{uid}-texte">
      {#each TEXT_SIZES as value (value)}
        <button
          type="submit"
          class="size size-{value}"
          name="texte"
          {value}
          aria-label={m.texts[value]}
          title={m.texts[value]}
          aria-pressed={text === value ? "true" : "false"}
        >
          <span aria-hidden="true">A</span>
        </button>
      {/each}
    </div>
    <p class="menu-heading" id="{uid}-mode">{m.mode}</p>
    <div role="group" aria-labelledby="{uid}-mode">
      {#each MODES as [value, icon] (value)}
        <button
          type="submit"
          class="menu-item"
          name="mode"
          {value}
          aria-pressed={mode === value ? "true" : "false"}
        >
          <Icon name={icon} />{m.modes[value]}
          {#if mode === value}<span class="mark"><Icon name="check" size="1.2rem" /></span>{/if}
        </button>
      {/each}
    </div>
    <p class="menu-heading" id="{uid}-theme">{m.theme}</p>
    <div role="group" aria-labelledby="{uid}-theme">
      {#each THEMES as value (value)}
        <button
          type="submit"
          class="menu-item"
          name="theme"
          {value}
          aria-pressed={theme === value ? "true" : "false"}
        >
          <Icon name="palette" />{m.themes[value]}
          {#if theme === value}<span class="mark"><Icon name="check" size="1.2rem" /></span>{/if}
        </button>
      {/each}
    </div>
    <p class="menu-heading" id="{uid}-langue">{m.language}</p>
    <div role="group" aria-labelledby="{uid}-langue">
      {#each LOCALES as locale (locale)}
        <button
          type="submit"
          class="menu-item"
          name="langue"
          value={locale}
          lang={locale}
          aria-pressed={i18n.locale === locale ? "true" : "false"}
        >
          <Icon name="globe" />{LOCALE_NAMES[locale]}
          {#if i18n.locale === locale}<span class="mark"><Icon name="check" size="1.2rem" /></span>{/if}
        </button>
      {/each}
    </div>
  </form>
</Menu>

<style>
  .sizes {
    display: flex;
    margin: 0.25rem 0.4rem 0.4rem;
    border: 2px solid var(--border);
    border-radius: 12px;
    overflow: hidden;
  }
  .size {
    flex: 1;
    min-height: 48px;
    border: 0;
    border-radius: 0;
    background: transparent;
    color: var(--text);
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    line-height: 1;
  }
  .size + .size {
    border-left: 2px solid var(--border);
  }
  .size:hover {
    background: var(--bg);
  }
  .size[aria-pressed="true"] {
    background: var(--action);
    color: var(--on-action);
  }
  .size-normal {
    font-size: 1rem;
  }
  .size-large {
    font-size: 1.25rem;
  }
  .size-larger {
    font-size: 1.55rem;
  }
</style>
