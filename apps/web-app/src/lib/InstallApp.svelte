<script lang="ts">
  import { onMount } from "svelte";

  import { appMessages } from "@wishalia/i18n/messages/app";
  import { useI18n } from "@wishalia/ui/i18n.ts";

  import { platform, shortcutAddress, type Platform } from "#lib/device.ts";

  let { appName, origin }: { appName: string; origin: string } = $props();
  const i18n = useI18n();
  const m = $derived(appMessages(i18n.locale).install);

  /** Chromium's install prompt (Android, Windows, ChromeOS, Linux), kept for the button. */
  interface InstallPrompt extends Event {
    prompt(): Promise<void>;
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
  }

  /** null until the page runs in the browser: without JavaScript, every set of steps shows. */
  let device = $state<Platform | null>(null);
  let installed = $state(false);
  let installPrompt = $state<InstallPrompt | null>(null);
  let copied = $state(false);
  const address = $derived(shortcutAddress(origin));

  onMount(() => {
    device = platform(navigator.userAgent, navigator.maxTouchPoints);
    installed =
      matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    const offer = (event: Event) => {
      event.preventDefault();
      installPrompt = event as InstallPrompt;
    };
    const done = () => {
      installed = true;
      installPrompt = null;
    };
    addEventListener("beforeinstallprompt", offer);
    addEventListener("appinstalled", done);
    return () => {
      removeEventListener("beforeinstallprompt", offer);
      removeEventListener("appinstalled", done);
    };
  });

  async function install() {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const { outcome } = await installPrompt.userChoice;
    installPrompt = null;
    if (outcome === "accepted") installed = true;
  }

  const show = (which: Platform) => device === null || device === which;
</script>

<section class="card" aria-labelledby="installer">
  <h2 id="installer">{m.title}</h2>
  <p class="muted">{m.intro(appName)}</p>

  <div role="status">
    {#if installed}
      <p class="notice">{m.installed(appName)}</p>
    {/if}
  </div>
  {#if installPrompt && !installed}
    <button type="button" class="accent install" onclick={install}>{m.install(appName)}</button>
  {/if}

  {#if show("android")}
    <h3>{m.android}</h3>
    <ol>
      <li>
        {m.androidMenu.before}<span aria-hidden="true">⋮</span><span class="visually-hidden"
          >{m.androidMenu.dots}</span
        >{m.androidMenu.after}
      </li>
      <li>
        {m.androidShare.before}<strong>{m.androidShare.share}</strong>{m.androidShare.then}<strong
          >{appName}</strong
        >{m.androidShare.after}
      </li>
    </ol>
  {/if}

  {#if show("ios")}
    <h3>{m.ios}</h3>
    <ol>
      <li>{m.iosHome.before}<strong>{m.iosHome.share}</strong>{m.iosHome.after}</li>
      <li>
        {m.iosShortcut(appName)}
        <ol type="a">
          {#each m.iosSteps as step (step)}<li>{step}</li>{/each}
        </ol>
      </li>
    </ol>
    <label for="adresse-raccourci">{m.address}</label>
    <div class="row">
      <input id="adresse-raccourci" readonly value={address} />
      {#if device !== null}
        <button
          type="button"
          class="secondary"
          onclick={async () => {
            await navigator.clipboard.writeText(address);
            copied = true;
          }}
        >
          {copied ? m.copied : m.copy}
        </button>
      {/if}
    </div>
    <p class="muted help">
      {m.docs.before}<a href="https://github.com/Arcanexus/wishalia/wiki/Install-the-app" rel="external noopener"
        >{m.docs.link}</a
      >{m.docs.after}
    </p>
  {/if}

  {#if show("computer")}
    <h3>{m.computer}</h3>
    <p>{m.computerSteps}</p>
  {/if}
</section>

<style>
  .card {
    margin-bottom: 1.5rem;
  }
  .install {
    margin-bottom: 1rem;
  }
  h3 {
    font-size: 1.15rem;
    margin-top: 1.25rem;
  }
  ol {
    padding-left: 1.4rem;
  }
  li {
    margin-bottom: 0.5rem;
  }
  ol ol {
    margin-top: 0.5rem;
  }
  .row {
    display: flex;
    gap: 0.5rem;
  }
  .row input {
    flex: 1;
    min-width: 0;
  }
  .help {
    font-size: 0.95rem;
    margin: 0.4rem 0 0;
  }
  @media (max-width: 30rem) {
    .row {
      flex-direction: column;
    }
  }
</style>
