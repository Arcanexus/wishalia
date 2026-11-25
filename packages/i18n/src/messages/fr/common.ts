/** Words both frontends share: the skip link, the header buttons, the error pages. */
export const common = {
  skipLink: "Aller au contenu",
  mode: {
    names: { device: "comme l'appareil", light: "clair", dark: "sombre" },
    current: (name: string) => `Affichage ${name}`,
    switch: (name: string, next: string) => `Affichage ${name}. Passer en affichage ${next}`,
  },
  language: {
    /** Before the buttons of the other languages, each named in its own language. */
    label: "Langue",
  },
  error: {
    title: { notFound: "Introuvable", other: "Erreur" },
    somethingWrong: "Quelque chose s'est mal passé",
  },
};
