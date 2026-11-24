<script lang="ts">
  /**
   * The header button: light, dark or as the device, in turn (docs/branding.md). A plain form to
   * the app's /preferences, so it works before the page's JavaScript has loaded.
   */
  type Mode = "device" | "light" | "dark";
  let {
    mode,
    nextMode,
    returnPath,
    showLabel = true,
  }: { mode: Mode; nextMode: Mode; returnPath: string; showLabel?: boolean } = $props();

  const labels = { device: "comme l'appareil", light: "clair", dark: "sombre" } as const;
</script>

<form method="POST" action="/preferences">
  <input type="hidden" name="retour" value={returnPath} />
  <button
    type="submit"
    class="secondary"
    aria-label="Affichage {labels[mode]}. Passer en affichage {labels[nextMode]}"
  >
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
      {#if mode === "dark"}
        <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" fill="currentColor" />
      {:else if mode === "light"}
        <circle cx="12" cy="12" r="4.5" fill="currentColor" />
        <path
          d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
        />
      {:else}
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
        <path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor" />
      {/if}
    </svg>
    {#if showLabel}<span class="label">Affichage {labels[mode]}</span>{/if}
  </button>
</form>

<style>
  /* Under a wide screen, the button keeps its symbol only; its name stays for screen readers */
  @media (max-width: 64rem) {
    .label {
      display: none;
    }
  }
</style>
