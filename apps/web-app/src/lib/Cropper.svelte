<script lang="ts">
  import { enhance } from "$app/forms";
  import { MIN_CROP } from "@wishalia/domain";

  import type { Crop } from "./types.ts";

  /**
   * Frames the image in a square (spec §6), the shape of the thumbnails. Drawn in SVG, with
   * attributes only (the CSP forbids style attributes). Four ways, for every hand: drag the frame,
   * tap where it should be (WCAG 2.5.7), the arrow keys, and the size slider.
   */
  let { src, crop, title }: { src: string; crop: Crop | null; title: string } = $props();

  // The image's size, once it is loaded: the frame's fractions depend on its shape
  let width = $state(0);
  let height = $state(0);
  $effect(() => {
    const image = new Image();
    image.onload = () => {
      width = image.naturalWidth;
      height = image.naturalHeight;
    };
    image.src = src;
  });

  const short = $derived(Math.min(width, height));
  // The frame in the image's pixels: its top-left corner and its side
  let size = $state(1);
  let x = $state(0);
  let y = $state(0);
  let ready = $state(false);
  $effect(() => {
    if (!short || ready) return;
    if (crop) {
      size = Math.min(1, Math.max(MIN_CROP, (crop.width * width) / short));
      x = crop.x * width;
      y = crop.y * height;
    } else {
      size = 1;
      x = (width - short) / 2;
      y = (height - short) / 2;
    }
    ready = true;
  });
  const side = $derived(size * short);
  const clamp = (value: number, max: number) => Math.min(Math.max(0, value), Math.max(0, max));
  const place = (left: number, top: number) => {
    x = clamp(left, width - side);
    y = clamp(top, height - side);
  };
  /** A new size keeps the frame's centre where it was. */
  const resize = (next: number) => {
    const centreX = x + side / 2;
    const centreY = y + side / 2;
    size = Math.min(1, Math.max(0.2, next));
    const nextSide = size * short;
    place(centreX - nextSide / 2, centreY - nextSide / 2);
  };
  const percent = $derived(Math.round(size * 100));
  const fractions = $derived(
    width && height ? { x: x / width, y: y / height, width: side / width, height: side / height } : null,
  );

  let svg = $state<SVGSVGElement>();
  /** Where a pointer is, in the image's pixels. */
  const at = (event: PointerEvent) => {
    const box = svg?.getBoundingClientRect();
    if (!box || !box.width) return { left: 0, top: 0 };
    return {
      left: ((event.clientX - box.left) / box.width) * width,
      top: ((event.clientY - box.top) / box.height) * height,
    };
  };
  let grab: { dx: number; dy: number } | null = null;
  function down(event: PointerEvent) {
    if (event.button !== 0) return;
    const point = at(event);
    const inside = point.left >= x && point.left <= x + side && point.top >= y && point.top <= y + side;
    // A tap outside the frame brings it there; a press inside takes it along
    if (!inside) place(point.left - side / 2, point.top - side / 2);
    grab = { dx: point.left - x, dy: point.top - y };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function move(event: PointerEvent) {
    if (!grab) return;
    const point = at(event);
    place(point.left - grab.dx, point.top - grab.dy);
  }
  const up = () => (grab = null);

  function key(event: KeyboardEvent) {
    const step = short * (event.shiftKey ? 0.1 : 0.02);
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = moves[event.key];
    if (delta) place(x + delta[0], y + delta[1]);
    else if (event.key === "+" || event.key === "=") resize(size + 0.05);
    else if (event.key === "-") resize(size - 0.05);
    else return;
    event.preventDefault();
  }
  let saving = $state(false);
</script>

{#if width && height}
  <form
    method="POST"
    action="?/crop"
    class="cropper"
    use:enhance={() => {
      saving = true;
      return async ({ update }) => {
        await update({ reset: false });
        saving = false;
      };
    }}
  >
    <p class="muted" id="cadre-aide">
      Faites glisser le cadre, ou touchez l'endroit à garder. Au clavier : les flèches le déplacent, + et −
      changent sa taille.
    </p>
    <!-- An application area: the arrow keys and the pointer move the frame (described above) -->
    <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
    <svg
      bind:this={svg}
      viewBox="0 0 {width} {height}"
      role="application"
      aria-roledescription="cadre"
      tabindex="0"
      aria-label="Cadre de l'image de « {title} » : {percent} % de la largeur"
      aria-describedby="cadre-aide"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      onkeydown={key}
    >
      <image href={src} {width} {height} />
      <path class="veil" fill-rule="evenodd" d="M0 0H{width}V{height}H0Z M{x} {y}h{side}v{side}h{-side}Z" />
      <rect class="frame" {x} {y} width={side} height={side} />
      <rect class="frame inner" {x} {y} width={side} height={side} />
    </svg>

    <label for="cadre-taille">Taille du cadre : {percent} %</label>
    <input
      id="cadre-taille"
      type="range"
      min="20"
      max="100"
      step="1"
      value={percent}
      oninput={(event) => resize(Number(event.currentTarget.value) / 100)}
    />

    {#if fractions}
      <input type="hidden" name="x" value={fractions.x} />
      <input type="hidden" name="y" value={fractions.y} />
      <input type="hidden" name="width" value={fractions.width} />
      <input type="hidden" name="height" value={fractions.height} />
    {/if}
    <div class="buttons">
      <button type="submit" disabled={saving}>{saving ? "Enregistrement…" : "Enregistrer le cadrage"}</button>
      <button type="submit" name="whole" value="1" class="secondary" disabled={saving}>
        Garder l'image entière
      </button>
    </div>
  </form>
{:else}
  <p class="muted">Chargement de l'image…</p>
{/if}

<style>
  .cropper p {
    margin: 0 0 0.75rem;
  }
  svg {
    display: block;
    width: 100%;
    max-width: 32rem;
    height: auto;
    border-radius: 12px;
    touch-action: none;
    cursor: move;
    background: var(--border);
    margin-bottom: 1rem;
  }
  svg:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 3px;
  }
  .veil {
    fill: rgb(0 0 0 / 0.55);
  }
  /* A white line and a dashed black one: the frame shows on any image */
  .frame {
    fill: none;
    stroke: #ffffff;
    stroke-width: 3px;
    vector-effect: non-scaling-stroke;
  }
  .frame.inner {
    stroke: #000000;
    stroke-width: 1px;
    stroke-dasharray: 6 6;
  }
  input[type="range"] {
    width: 100%;
    max-width: 32rem;
    min-height: 44px;
    accent-color: var(--action);
    display: block;
    margin-bottom: 1rem;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
</style>
