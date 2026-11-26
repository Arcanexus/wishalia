/** Words both frontends share: the skip link, the header buttons, the error pages. */
export const common = {
  skipLink: "Aller au contenu",
  language: {
    /** Before the buttons of the other languages, each named in its own language. */
    label: "Langue",
  },
  /** The display menu of the header: mode, theme and language (docs/branding.md). */
  display: {
    label: "Affichage, thème et langue",
    mode: "Affichage",
    modes: { device: "Comme l'appareil", light: "Clair", dark: "Sombre" },
    theme: "Thème",
    themes: { auto: "Automatique", neutral: "Neutre", christmas: "Noël" },
    language: "Langue",
  },
  /** The account menu of the header, and the sign-in icon when nobody is signed in. */
  account: {
    menu: (name: string) => `Mon compte, ${name}`,
    settings: "Réglages du compte",
    lists: "Mes listes",
    signIn: "Se connecter",
    signOut: "Se déconnecter",
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
