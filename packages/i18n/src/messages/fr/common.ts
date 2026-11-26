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
  /** The image viewer: an item's images, opened big (docs/images.md). */
  gallery: {
    open: (title: string, count: number) =>
      count > 1 ? `Agrandir les ${count} images de « ${title} »` : `Agrandir l'image de « ${title} »`,
    dialog: (title: string) => `Images de « ${title} »`,
    image: (title: string, position: number, count: number) =>
      count > 1 ? `${title}, image ${position} sur ${count}` : `${title}`,
    position: (position: number, count: number) => `Image ${position} sur ${count}`,
    show: (position: number) => `Voir l'image ${position}`,
    previous: "Image précédente",
    next: "Image suivante",
    close: "Fermer",
  },
};
