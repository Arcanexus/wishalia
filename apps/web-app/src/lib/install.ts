import type { ModeChoice, ThemeName } from "@wishalia/domain";

/**
 * What makes the app installable (docs/install.md): the web app manifest, with the share target
 * that puts Wishalia in Android's share menu, and the colour of the browser's bar. Pure.
 */

/** The colour of the app's top bar (--surface in @wishalia/ui), for the phone's status bar. */
export const BAR_COLOURS: Readonly<Record<ThemeName, { light: string; dark: string }>> = {
  neutral: { light: "#ffffff", dark: "#1e232a" },
  christmas: { light: "#ffffff", dark: "#1c2621" },
};

/** The page's background (--bg), shown while the installed app starts. */
const SPLASH = "#f6f5f2";

/**
 * The theme-color tags of a page: one colour when the person forced light or dark, else one for
 * each of the device's modes. Only fixed colours go in, never text from a request.
 */
export function themeColorTags(theme: ThemeName, mode: ModeChoice): string {
  const colours = BAR_COLOURS[theme];
  if (mode !== "device") return `<meta name="theme-color" content="${colours[mode]}" />`;
  return [
    `<meta name="theme-color" content="${colours.light}" media="(prefers-color-scheme: light)" />`,
    `<meta name="theme-color" content="${colours.dark}" media="(prefers-color-scheme: dark)" />`,
  ].join("\n    ");
}

/** Where the share menu sends what was shared: a page that fills the quick add, never adds alone. */
export const SHARE_PATH = "/ajouter";

export function manifest(appName: string) {
  return {
    id: "/",
    name: appName,
    short_name: appName,
    description: "Vos listes d'envies, à partager en famille sans rien gâcher de la surprise.",
    lang: "fr",
    dir: "ltr",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: SPLASH,
    theme_color: BAR_COLOURS.neutral.light,
    categories: ["lifestyle", "shopping"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      { src: "/favicon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
    shortcuts: [
      {
        name: "Ajouter une envie",
        url: SHARE_PATH,
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Mes événements",
        url: "/evenements",
        icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }],
      },
    ],
    // A GET: the shared title, text and link arrive in the address, and the page asks before adding
    share_target: {
      action: SHARE_PATH,
      method: "GET",
      // Only read for a POST, but Chrome warns when it is missing
      enctype: "application/x-www-form-urlencoded",
      params: { title: "title", text: "text", url: "url" },
    },
  };
}
