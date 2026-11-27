<script lang="ts">
  /**
   * Scans a barcode with the camera, for the quick add (docs/management-app.md, « Scan a barcode »).
   * Only where the browser reads barcodes itself (BarcodeDetector: Chrome and Edge on Android, and
   * on a computer with a camera); elsewhere the button never shows. The picture never leaves the
   * device: the browser reads the code, and the camera stops as soon as it has one.
   */
  import { onDestroy } from "svelte";
  import { readScanned, spacedIsbn, type Scanned } from "@wishalia/domain";
  import { appMessages } from "@wishalia/i18n/messages/app";
  import Icon from "@wishalia/ui/Icon.svelte";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import IconButton from "./IconButton.svelte";

  let { onadd }: { onadd: (input: string) => void } = $props();

  interface Detector {
    detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>;
  }
  type DetectorClass = new (options: { formats: string[] }) => Detector;

  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).scan);
  const id = $props.id();
  const Barcode = (globalThis as { BarcodeDetector?: DetectorClass }).BarcodeDetector;
  // Known once the page runs in the browser: the server renders it without the button
  let available = $state(false);
  $effect(() => {
    available = !!Barcode && !!globalThis.navigator?.mediaDevices?.getUserMedia;
  });
  let dialog = $state<HTMLDialogElement>();
  let video = $state<HTMLVideoElement>();
  let stream: MediaStream | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let found = $state<Scanned | null>(null);
  let failed = $state(false);

  function stop() {
    if (timer) clearTimeout(timer);
    timer = null;
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
  }

  async function open() {
    found = null;
    failed = false;
    dialog?.showModal();
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
      if (!video || !Barcode) return stop();
      video.srcObject = stream;
      await video.play();
      const detector = new Barcode({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
      const look = async () => {
        if (!video || !stream) return;
        const codes = await detector.detect(video).catch(() => []);
        const scanned = codes.map((code) => readScanned(code.rawValue)).find((code) => code !== null);
        if (scanned) {
          found = scanned;
          stop();
          return;
        }
        timer = setTimeout(look, 250);
      };
      void look();
    } catch {
      // Refused, or no camera
      failed = true;
      stop();
    }
  }

  function close() {
    stop();
    dialog?.close();
  }

  function add(input: string) {
    close();
    onadd(input);
  }

  onDestroy(stop);
</script>

{#if available}
  <IconButton icon="barcode" label={m.label} tip={m.tip} opens="dialog" onclick={() => void open()} />

  <dialog
    bind:this={dialog}
    class="scan"
    aria-labelledby="{id}-titre"
    onclose={stop}
    oncancel={stop}
  >
    <div class="top">
      <h2 id="{id}-titre">{m.title}</h2>
      <IconButton icon="close" label={m.close} tip={m.close} onclick={close} />
    </div>
    {#if failed}
      <p role="alert">{m.noCamera}</p>
    {:else if found}
      <div class="found" role="status">
        {#if found.kind === "book"}
          <p><strong>{m.book}</strong><span class="muted">ISBN {spacedIsbn(found.isbn)}</span></p>
          <p class="muted">{m.bookHelp}</p>
          <button type="button" class="accent" onclick={() => found?.kind === "book" && add(found.url)}>
            <Icon name="plus" />{m.add}
          </button>
        {:else}
          <p><strong>{m.other}</strong><span class="muted">{found.code}</span></p>
          <p class="muted">{m.otherHelp}</p>
          <button type="button" class="secondary" onclick={close}>{m.write}</button>
        {/if}
      </div>
    {:else}
      <div class="camera">
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={video} playsinline muted></video>
        <span class="frame" aria-hidden="true"></span>
      </div>
      <p class="aim">{m.aim}</p>
    {/if}
  </dialog>
{/if}

<style>
  .scan {
    width: min(26rem, calc(100vw - 2rem));
    padding: 1rem;
    border: 1px solid var(--border);
    border-radius: 16px;
    background: var(--surface);
    color: var(--text);
  }
  .scan::backdrop {
    background: rgb(0 0 0 / 0.7);
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }
  h2 {
    margin: 0;
    font-size: 1.2rem;
  }
  .camera {
    position: relative;
    aspect-ratio: 4 / 3;
    border-radius: 12px;
    overflow: hidden;
    background: #111;
  }
  video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  /* Where to put the code: a frame across the middle */
  .frame {
    position: absolute;
    inset: 30% 10%;
    border: 3px solid #8fd3ae;
    border-radius: 10px;
  }
  .aim {
    margin: 0.75rem 0 0;
    text-align: center;
  }
  .found p {
    display: flex;
    flex-direction: column;
    margin: 0 0 0.6rem;
  }
  .found button {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }
</style>
