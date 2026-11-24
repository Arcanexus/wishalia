<script lang="ts">
  import { onMount } from "svelte";

  import { platform, shortcutAddress, type Platform } from "#lib/device.ts";

  let { appName, origin }: { appName: string; origin: string } = $props();

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
  <h2 id="installer">L'application sur votre téléphone</h2>
  <p class="muted">
    Installée, {appName} s'ouvre depuis l'écran d'accueil comme une application, et une envie s'ajoute depuis le
    bouton Partager de n'importe quelle application ou site.
  </p>

  <div role="status">
    {#if installed}
      <p class="notice">{appName} est installée sur cet appareil.</p>
    {/if}
  </div>
  {#if installPrompt && !installed}
    <button type="button" class="accent install" onclick={install}>Installer {appName}</button>
  {/if}

  {#if show("android")}
    <h3>Android</h3>
    <ol>
      <li>
        Dans Chrome, ouvrez le menu <span aria-hidden="true">⋮</span><span class="visually-hidden">
          (trois points)
        </span> puis touchez «&nbsp;Installer l'application&nbsp;» ou «&nbsp;Ajouter à l'écran d'accueil&nbsp;».
      </li>
      <li>
        Ensuite, depuis un site ou une application de boutique, touchez <strong>Partager</strong> puis
        <strong>{appName}</strong> : l'envie arrive remplie, il reste à toucher «&nbsp;Ajouter à ma liste&nbsp;».
      </li>
    </ol>
  {/if}

  {#if show("ios")}
    <h3>iPhone et iPad</h3>
    <ol>
      <li>Dans Safari, touchez <strong>Partager</strong> puis «&nbsp;Sur l'écran d'accueil&nbsp;».</li>
      <li>
        Apple ne laisse pas les sites entrer dans le menu Partager&nbsp;: un raccourci le fait. Dans
        l'application Raccourcis, créez un raccourci «&nbsp;{appName}&nbsp;»&nbsp;:
        <ol type="a">
          <li>activez «&nbsp;Afficher dans la feuille de partage&nbsp;»&nbsp;;</li>
          <li>ajoutez l'action «&nbsp;Encoder en URL&nbsp;», avec l'entrée du raccourci&nbsp;;</li>
          <li>
            ajoutez l'action «&nbsp;Texte&nbsp;»&nbsp;: l'adresse ci-dessous, suivie du texte encodé&nbsp;;
          </li>
          <li>ajoutez l'action «&nbsp;Ouvrir les URL&nbsp;».</li>
        </ol>
      </li>
    </ol>
    <label for="adresse-raccourci">Adresse pour le raccourci</label>
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
          {copied ? "Adresse copiée" : "Copier l'adresse"}
        </button>
      {/if}
    </div>
    <p class="muted help">
      Le pas-à-pas détaillé est dans
      <a href="https://github.com/Arcanexus/wishalia/wiki/Install-the-app" rel="external noopener">
        la documentation
      </a>.
    </p>
  {/if}

  {#if show("computer")}
    <h3>Ordinateur</h3>
    <p>
      Dans Chrome ou Edge, cliquez sur l'icône d'installation à droite de la barre d'adresse. Sur Mac, dans
      Safari, choisissez «&nbsp;Fichier&nbsp;» puis «&nbsp;Ajouter au Dock&nbsp;».
    </p>
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
