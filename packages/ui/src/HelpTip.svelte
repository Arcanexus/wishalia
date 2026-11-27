<script lang="ts">
  import { onMount } from "svelte";
  /**
   * A « ? » next to a setting that needs a word more (docs/user-guide.md): it shows a short help in
   * a bubble, with a link to the part of the guide about it. A button that opens and closes the
   * bubble (aria-expanded); Escape or a tap elsewhere closes it. The help is written in the page,
   * so that it is read without JavaScript too, under the setting.
   */
  import { commonMessages } from "@wishalia/i18n/messages/common";

  import { topicUrl, type HelpTopic } from "./help.ts";
  import { useI18n } from "./i18n.ts";
  import Icon from "./Icon.svelte";

  let {
    about,
    text,
    help,
    topic,
  }: {
    /** What it helps with, for its name: « Aide : quand les cadeaux sont dévoilés ». */
    about: string;
    text: string;
    /** The guide's address (the layout's `help`); with `topic`, its part about the setting. */
    help?: string | undefined;
    topic?: HelpTopic | undefined;
  } = $props();

  const uid = $props.id();
  const i18n = useI18n();
  const m = $derived(commonMessages(i18n.locale).help);
  let open = $state(false);
  let root = $state<HTMLSpanElement>();
  // Without JavaScript the bubble shows under its setting, open
  let ready = $state(false);
  onMount(() => (ready = true));

  $effect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root?.contains(event.target as Node)) open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        open = false;
        root?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", escape);
    };
  });
</script>

<span class="help-tip" class:ready bind:this={root}>
  {#if ready}
    <button
      type="button"
      class="ask"
      aria-label={m.tip(about)}
      title={m.tip(about)}
      aria-expanded={open}
      aria-controls="{uid}-bulle"
      onclick={() => (open = !open)}
    >
      <Icon name="help" />
    </button>
  {/if}
  <span class="bubble" id="{uid}-bulle" hidden={ready && !open} role={ready ? "note" : undefined}>
    {text}
    {#if help && topic}
      <a href={topicUrl(help, m.topics[topic].heading)} target="_blank" rel="noopener noreferrer">
        {m.more}<span class="visually-hidden">{m.newTab}</span>
      </a>
    {/if}
  </span>
</span>

<style>
  .help-tip {
    display: inline;
  }
  .help-tip.ready {
    position: relative;
    display: inline-flex;
    vertical-align: middle;
  }
  /* A 44 px target around a small icon, in the colour of links */
  .ask {
    display: inline-grid;
    place-items: center;
    width: 44px;
    height: 44px;
    min-height: 44px;
    margin: -10px 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--link);
  }
  .ask:hover,
  .ask[aria-expanded="true"] {
    background: var(--bg);
  }
  .bubble {
    display: block;
    margin: 0.35rem 0;
    color: var(--text-2);
    font-size: 0.95rem;
    font-weight: 400;
    line-height: 1.45;
  }
  .ready .bubble {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    z-index: 5;
    width: max-content;
    max-width: min(22rem, calc(100vw - 3rem));
    margin: 0;
    padding: 0.8rem 1rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
    text-transform: none;
    letter-spacing: normal;
  }
  .bubble[hidden] {
    display: none;
  }
  .bubble a {
    display: block;
    margin-top: 0.4rem;
  }
</style>
