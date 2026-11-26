<script lang="ts">
  /**
   * A menu of the header bar, at its top right (docs/branding.md, « Header »): an icon that opens
   * a small panel of links and buttons. A <details>, so it opens before the page's JavaScript has
   * loaded; with it, Escape, a click elsewhere or the focus going away closes it, and Escape puts
   * the focus back on the icon. Its words are its name, and a tip on hover and keyboard focus.
   */
  import type { Snippet } from "svelte";

  import Icon from "./Icon.svelte";
  import type { IconName } from "./icons.ts";

  let {
    icon,
    label,
    initial,
    children,
  }: {
    icon: IconName;
    label: string;
    /** A letter drawn instead of the icon: the first one of the person's name. */
    initial?: string | undefined;
    children: Snippet;
  } = $props();

  let menu = $state<HTMLDetailsElement>();
  let open = $state(false);

  function close(focus = false) {
    if (!menu?.open) return;
    menu.open = false;
    if (focus) menu.querySelector("summary")?.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Escape" && menu?.open) {
      event.preventDefault();
      close(true);
    }
  }

  function onfocusout(event: FocusEvent) {
    if (!menu?.contains(event.relatedTarget as Node | null)) close();
  }

  // Listened to on the <details> itself: its summary is the control, the panel its content
  $effect(() => {
    const element = menu;
    if (!element) return;
    element.addEventListener("keydown", onkeydown);
    element.addEventListener("focusout", onfocusout);
    return () => {
      element.removeEventListener("keydown", onkeydown);
      element.removeEventListener("focusout", onfocusout);
    };
  });

  $effect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!menu?.contains(event.target as Node)) close();
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  });
</script>

<details class="menu" bind:this={menu} bind:open>
  <summary class="button secondary" aria-label={label}>
    {#if initial}
      <span class="initial" aria-hidden="true">{initial}</span>
    {:else}
      <Icon name={icon} />
    {/if}
  </summary>
  <span class="tip" aria-hidden="true">{label}</span>
  <div class="panel">
    {@render children()}
  </div>
</details>

<style>
  .menu {
    position: relative;
  }
  summary {
    list-style: none;
    width: 48px;
    padding: 0;
  }
  summary::-webkit-details-marker {
    display: none;
  }
  .menu[open] summary {
    border-color: var(--action);
  }
  .initial {
    display: grid;
    place-items: center;
    width: 2rem;
    height: 2rem;
    border-radius: 50%;
    background: var(--action);
    color: var(--on-action);
    font-family: "Nunito Variable", system-ui, sans-serif;
    font-weight: 800;
    font-size: 1.05rem;
    line-height: 1;
  }
  /* The tip under the icon, kept inside the page at the right (WCAG 1.4.13) */
  .tip {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 3;
    padding: 0.3rem 0.6rem;
    border-radius: 6px;
    background: var(--text);
    color: var(--surface);
    font-size: 0.9rem;
    font-weight: 600;
    white-space: nowrap;
    visibility: hidden;
    pointer-events: none;
  }
  .menu:not([open]):hover .tip,
  .menu:not([open]):has(summary:focus-visible) .tip {
    visibility: visible;
  }
  .panel {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 4;
    width: max-content;
    min-width: 15rem;
    max-width: min(22rem, calc(100vw - 2rem));
    padding: 0.5rem;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    box-shadow: 0 10px 30px rgb(0 0 0 / 0.18);
  }
  /* What the panels hold: headings, rows of links and buttons with an icon in front */
  .panel :global(.menu-heading) {
    margin: 0.4rem 0.6rem 0.2rem;
    color: var(--text-2);
    font-size: 0.85rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }
  .panel :global(.menu-heading:not(:first-child)) {
    margin-top: 0.75rem;
  }
  .panel :global(.menu-who) {
    display: flex;
    flex-direction: column;
    padding: 0.4rem 0.6rem 0.6rem;
    margin-bottom: 0.25rem;
    border-bottom: 1px solid var(--border);
    overflow-wrap: anywhere;
  }
  .panel :global(.menu-item) {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    width: 100%;
    min-height: 44px;
    padding: 0 0.6rem;
    border: 0;
    border-radius: 8px;
    background: transparent;
    color: var(--text);
    font-weight: 600;
    text-align: left;
    text-decoration: none;
    justify-content: flex-start;
  }
  .panel :global(.menu-item:hover) {
    background: var(--bg);
  }
  .panel :global(.menu-item .mark) {
    margin-left: auto;
    color: var(--link);
  }
  .panel :global(.menu-item[aria-pressed="true"]) {
    background: var(--bg);
  }
  .panel :global(form) {
    margin: 0;
  }
  .panel :global(.menu-separator) {
    border: 0;
    border-top: 1px solid var(--border);
    margin: 0.4rem 0;
  }
</style>
