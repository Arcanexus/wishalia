<script lang="ts">
  /**
   * An item's image that opens big (docs/images.md): a link to the whole image, so it works before
   * the page's JavaScript has loaded, and with it a modal viewer of all the item's images. Arrows
   * and Home/End on the keyboard, a swipe on a touch screen, the buttons for everyone; Escape, the
   * cross or a click outside the frame closes it, and the focus goes back to the image. Nothing big
   * is fetched before the viewer opens, then only the image shown and its two neighbours.
   */
  import { commonMessages } from "@wishalia/i18n/messages/common";
  import { tick, type Snippet } from "svelte";

  import { galleryOf, keyTarget, step, swipeDirection, type GallerySources } from "./gallery.ts";
  import { useI18n } from "./i18n.ts";

  let {
    title,
    image,
    children,
    class: className = "",
  }: { title: string; image: GallerySources; children: Snippet; class?: string } = $props();

  const i18n = useI18n();
  const m = $derived(commonMessages(i18n.locale).gallery);
  const sources = $derived(galleryOf(image));
  const count = $derived(sources.length);

  let trigger = $state<HTMLAnchorElement>();
  let dialog = $state<HTMLDialogElement>();
  let opened = $state(false);
  let index = $state(0);

  async function open(event: MouseEvent) {
    // A new tab or window, as the person asked: the link does it
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (!dialog?.showModal) return;
    event.preventDefault();
    index = 0;
    opened = true;
    // Once its buttons are there: the dialog then puts the focus on the first one, the cross
    await tick();
    dialog.showModal();
  }

  const close = () => dialog?.close();

  /** The dialog closed (cross, Escape, outside the frame): back to the image that opened it. */
  function closed() {
    opened = false;
    trigger?.focus();
  }

  const go = (to: number) => (index = step(to, 0, count));

  function onkeydown(event: KeyboardEvent) {
    const target = keyTarget(event.key, index, count);
    if (target === null) return;
    event.preventDefault();
    go(target);
  }

  // Outside the frame: only a click that started there too (a drag out of the frame is not one)
  let downOnBackdrop = false;
  let start: { x: number; y: number; id: number } | null = null;

  function onpointerdown(event: PointerEvent) {
    downOnBackdrop = event.target === dialog;
    start =
      event.pointerType === "mouse" ? null : { x: event.clientX, y: event.clientY, id: event.pointerId };
  }

  function onpointerup(event: PointerEvent) {
    if (!start || start.id !== event.pointerId || count < 2) return;
    const direction = swipeDirection(event.clientX - start.x, event.clientY - start.y);
    start = null;
    if (direction) go(index + direction);
  }

  function onclick(event: MouseEvent) {
    if (event.target === dialog && downOnBackdrop) close();
    downOnBackdrop = false;
  }

  // The neighbours, ahead of the arrows: the browser keeps them for the next step
  $effect(() => {
    if (!opened || count < 2) return;
    for (const near of new Set([step(index, 1, count), step(index, -1, count)])) {
      const ahead = new Image();
      ahead.decoding = "async";
      ahead.src = sources[near] ?? "";
    }
  });
</script>

<!-- The whole image: a plain link before the JavaScript, the viewer with it -->
<a
  bind:this={trigger}
  class="zoom {className}"
  href={sources[0]}
  aria-label={m.open(title, count)}
  aria-haspopup="dialog"
  onclick={open}
>
  {@render children()}
  {#if count > 1}
    <span class="count" aria-hidden="true">
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <rect x="7" y="3" width="14" height="14" rx="2" />
        <path d="M3 7v12a2 2 0 0 0 2 2h12" />
      </svg>
      {count}
    </span>
  {/if}
</a>

<dialog
  bind:this={dialog}
  class="wishalia-gallery"
  aria-label={m.dialog(title)}
  onclose={closed}
  {onclick}
  {onkeydown}
  {onpointerdown}
  {onpointerup}
>
  {#if opened}
    <div class="frame">
      <div class="bar">
        <p class="position" aria-live="polite">{count > 1 ? m.position(index + 1, count) : ""}</p>
        <span class="tipped">
          <button type="button" class="secondary icon" aria-label={m.close} onclick={close}>
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
          <span class="tip" aria-hidden="true">{m.close}</span>
        </span>
      </div>
      <div class="stage">
        {#key index}
          <img src={sources[index]} alt={m.image(title, index + 1, count)} decoding="async" />
        {/key}
      </div>
      {#if count > 1}
        <div class="bar">
          <span class="tipped">
            <button
              type="button"
              class="secondary icon"
              aria-label={m.previous}
              onclick={() => go(index - 1)}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M15 5l-7 7 7 7" /></svg>
            </button>
            <span class="tip" aria-hidden="true">{m.previous}</span>
          </span>
          <ul class="dots">
            {#each sources as source, at (source)}
              <li>
                <button
                  type="button"
                  class="dot"
                  aria-label={m.show(at + 1)}
                  aria-current={at === index ? "true" : undefined}
                  onclick={() => go(at)}
                >
                  <span aria-hidden="true"></span>
                </button>
              </li>
            {/each}
          </ul>
          <span class="tipped">
            <button type="button" class="secondary icon" aria-label={m.next} onclick={() => go(index + 1)}>
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M9 5l7 7-7 7" /></svg>
            </button>
            <span class="tip" aria-hidden="true">{m.next}</span>
          </span>
        </div>
      {/if}
    </div>
  {/if}
</dialog>

<style>
  .zoom {
    position: relative;
    display: block;
    flex: none;
    border-radius: 12px;
    cursor: zoom-in;
  }
  .zoom :global(img) {
    display: block;
  }
  /* How many images it opens, over the thumbnail's corner */
  .count {
    position: absolute;
    right: 0.3rem;
    bottom: 0.3rem;
    display: inline-flex;
    align-items: center;
    gap: 0.2rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: var(--surface);
    color: var(--text);
    border: 1px solid var(--border);
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.4;
  }
  .count svg {
    width: 0.85rem;
    height: 0.85rem;
  }
  svg {
    fill: none;
    stroke: currentColor;
    stroke-width: 2.5;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  dialog {
    /* The whole screen: a click beside the frame lands on the dialog itself */
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    padding: 1rem;
    border: 0;
    background: transparent;
    color: var(--text);
    overscroll-behavior: contain;
  }
  dialog[open] {
    display: grid;
    place-items: center;
  }
  dialog::backdrop {
    background: rgb(0 0 0 / 0.8);
  }
  :global(html:has(dialog.wishalia-gallery[open])) {
    overflow: hidden;
  }
  .frame {
    display: grid;
    gap: 0.5rem;
    width: min(64rem, 100%);
    max-height: 100%;
    padding: 0.75rem;
    border-radius: 16px;
    background: var(--surface);
    border: 1px solid var(--border);
  }
  .bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .position {
    margin: 0;
    padding-left: 0.25rem;
    font-weight: 600;
    color: var(--text-2);
  }
  .stage {
    display: grid;
    /* A track of the stage's own size, so that the image's max-height: 100% holds */
    grid-template: 100% / 100%;
    place-items: center;
    /* One height for every image: the buttons stay in place from one image to the next */
    height: min(calc(100dvh - 12rem), 46rem, 130vw);
    min-height: 12rem;
    /* A horizontal swipe is the viewer's; the page keeps vertical moves and zooming */
    touch-action: pan-y pinch-zoom;
  }
  .stage img {
    display: block;
    max-width: 100%;
    max-height: 100%;
    width: auto;
    height: auto;
    object-fit: contain;
    border-radius: 8px;
    user-select: none;
    -webkit-user-drag: none;
  }
  .icon {
    width: 48px;
    padding: 0;
  }
  .icon svg {
    width: 1.4rem;
    height: 1.4rem;
  }
  /* The words of an icon, on hover and keyboard focus (WCAG 1.4.13: Escape closes everything) */
  .tipped {
    position: relative;
    display: inline-flex;
  }
  .tip {
    position: absolute;
    top: calc(100% + 0.35rem);
    left: 50%;
    translate: -50% 0;
    z-index: 1;
    padding: 0.2rem 0.55rem;
    border-radius: 6px;
    background: var(--text);
    color: var(--bg);
    font-size: 0.875rem;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
  }
  /* At the ends of a bar, the tip stays inside the frame */
  .bar > .tipped:first-child .tip {
    left: 0;
    translate: none;
  }
  .bar > .tipped:last-child .tip {
    left: auto;
    right: 0;
    translate: none;
  }
  .stage + .bar .tip {
    top: auto;
    bottom: calc(100% + 0.35rem);
  }
  .tipped:hover .tip,
  .tipped:has(:focus-visible) .tip {
    opacity: 1;
  }
  .dots {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.25rem;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .dot {
    min-height: 32px;
    width: 32px;
    padding: 0;
    background: transparent;
    border: 0;
  }
  .dot span {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    border: 2px solid var(--text-2);
  }
  .dot[aria-current="true"] span {
    background: var(--text);
    border-color: var(--text);
  }
</style>
