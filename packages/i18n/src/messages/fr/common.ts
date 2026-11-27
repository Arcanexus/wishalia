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
    text: "Taille du texte",
    texts: { normal: "Normale", large: "Grande", larger: "Très grande" },
  },
  /**
   * The help menu of the header (docs/user-guide.md): the guide, then the parts of it that the page
   * is about. `heading` is the guide's own heading, which makes the link to its part.
   */
  help: {
    label: "Aide",
    guide: "Guide d'utilisation",
    newTab: " (nouvel onglet)",
    here: "Sur cette page",
    topics: {
      add: { label: "Ajouter une envie ou une série", heading: "Ajouter une envie" },
      order: { label: "Ranger ses envies", heading: "Ranger les envies" },
      share: { label: "Partager la liste", heading: "Partager sa liste" },
      surprise: { label: "Comment la surprise est gardée", heading: "La règle d'or : la surprise" },
      occasions: { label: "Les occasions", heading: "Les occasions" },
      give: { label: "Offrir un cadeau", heading: "Offrir un cadeau (pour les proches)" },
      display: { label: "Affichage et taille du texte", heading: "Affichage, langue et application" },
    },
    /** A « ? » next to a setting: what it says, and the part of the guide about it. */
    tip: (about: string) => `Aide : ${about}`,
    more: "En savoir plus dans le guide",
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
  /** The foot of every page: help for the people, and the version that runs (docs/user-guide.md). */
  footer: {
    help: "Aide : le guide d'utilisation",
    helpNewTab: " (nouvel onglet)",
    version: (version: string) => `Version ${version}`,
  },
};
