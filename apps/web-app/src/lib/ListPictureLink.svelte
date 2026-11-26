<script lang="ts">
  import ListBadge from "@wishalia/ui/ListBadge.svelte";

  /**
   * The list's picture next to its title, as a link to change it (docs/list-pictures.md): a small
   * pencil on its corner says it can be changed, its words in a tip on hover and on keyboard focus
   * (WCAG 1.4.13: Escape hides it). Its name is its label, so a screen reader always says it.
   */
  let {
    picture,
    href,
    label,
    tip,
  }: {
    picture: { icon: string | null; image: { small: string; medium: string } | null };
    href: string;
    label: string;
    tip: string;
  } = $props();
  let hidden = $state(false);
</script>

<span class="wrap" class:hidden>
  <!-- The caller resolves the address -->
  <!-- eslint-disable svelte/no-navigation-without-resolve -->
  <a
    {href}
    aria-label={label}
    onkeydown={(event) => {
      if (event.key === "Escape") hidden = true;
    }}
    onpointerenter={() => (hidden = false)}
    onfocus={() => (hidden = false)}
  >
    <ListBadge {picture} size="medium" />
    <svg class="pen" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 20l1-4L16 5l3 3L8 19z" />
      <path d="M14 7l3 3" />
    </svg>
  </a>
  <!-- eslint-enable svelte/no-navigation-without-resolve -->
  <span class="tip" aria-hidden="true">{tip}</span>
</span>

<style>
  .wrap {
    position: relative;
    display: inline-flex;
    flex: none;
  }
  a {
    position: relative;
    display: inline-flex;
    border-radius: 14px;
  }
  a:hover :global(.badge) {
    border-color: var(--action);
  }
  .pen {
    position: absolute;
    right: -6px;
    bottom: -6px;
    width: 24px;
    height: 24px;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: 50%;
    background: var(--surface);
    fill: none;
    stroke: var(--text);
    stroke-width: 2.4;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .tip {
    position: absolute;
    bottom: calc(100% + 6px);
    left: 0;
    z-index: 2;
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
  .wrap:hover .tip,
  .wrap:has(:focus-visible) .tip {
    visibility: visible;
  }
  .wrap.hidden .tip {
    visibility: hidden;
  }
</style>
