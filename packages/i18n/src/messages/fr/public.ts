/** The public site (apps/web-public): its home page, the guests' page and its give form. */
export const publicSite = {
  meta: {
    title: (app: string) => `${app} · une liste de souhaits`,
    description: "Une liste de souhaits partagée avec vous.",
  },
  error: {
    linkTitle: "Lien introuvable",
    title: "Erreur",
    wrong: "Quelque chose s'est mal passé",
    gone: "Ce lien ne fonctionne plus",
    goneHelp:
      "Il a peut-être été remplacé, ou il est arrivé à sa date de fin. Demandez un nouveau lien à la personne qui vous l'a envoyé.",
    failed: "La liste n'a pas pu s'afficher. Réessayez dans un instant.",
  },
  home: {
    myLists: "Mes listes",
    signIn: "Se connecter",
    title: "Les envies de toute la famille, au même endroit",
    lead: "Chacun dit ce qui lui ferait plaisir. Les proches s'organisent pour offrir, à plusieurs s'il le faut. Et la surprise reste entière : on ne voit jamais qui vous offre quoi avant l'occasion.",
    hello: (name: string) => `Bonjour ${name} !`,
    gotLink: "Vous avez reçu un lien ?",
    gotLinkHelp:
      "Ouvrez-le tel quel, depuis votre message : pas de compte, rien à installer. Ou collez-le ici.",
    link: "Le lien reçu",
    noLink: "Ce texte ne contient pas de lien de liste. Copiez tout le lien reçu, puis collez-le ici.",
    open: "Ouvrir la liste",
    yourLists: "Vos listes",
    account: "Vous avez un compte ?",
    yourListsHelp: "Ajoutez une envie, partagez une liste, préparez une occasion.",
    openLists: "Ouvrir mes listes",
    accountHelp:
      "Connectez-vous pour gérer vos listes, ou pour retrouver ce que vous offrez sur tous vos appareils.",
    find: "Trouver une liste publique",
    findHelp:
      "Certaines listes sont ouvertes à tous : tout le monde peut y participer. Les autres restent privées, et ne se voient qu'avec le lien que l'on vous a envoyé.",
    search: "Le prénom de la personne, ou le nom de sa liste",
    searchButton: "Chercher",
    noMatch: (query: string) =>
      `Aucune liste publique ne correspond à « ${query} ». Vérifiez l'orthographe, ou demandez le lien à la personne.`,
    noPublic: "Aucune liste n'est publique pour l'instant.",
    results: (n: number, more: boolean, query: string) =>
      `${n}${more ? " premières" : ""} liste${n > 1 ? "s" : ""} pour « ${query} »`,
    latest: "Les listes publiques les plus récentes",
    wishes: (n: number) => (n === 0 ? "Aucune envie pour l'instant" : n === 1 ? "1 envie" : `${n} envies`),
    wishesOf: (owner: string) => `Les envies de ${owner}`,
    see: "Voir la liste",
    seeLabel: (list: string, owner: string) => `Voir « ${list} », les envies de ${owner}`,
    more: "D'autres listes correspondent : précisez votre recherche.",
  },
  list: {
    own: {
      strong: "C'est votre propre lien.",
      text: " Vous voyez la liste comme vos proches, mais sans rien de ce qu'ils vous offrent : la surprise reste entière.",
    },
    notOwner: (owner: string) => `Vous n'êtes pas ${owner} ?`,
    folded: (owner: string) =>
      `Ce que vos proches offrent reste caché pour l'instant, au cas où cet appareil serait celui de ${owner}. Dites-nous que ce n'est pas le cas, et vous verrez ce qui est déjà pris, et pourrez offrir à votre tour.`,
    unfold: (owner: string) => `Je ne suis pas ${owner}, voir les cadeaux`,
    unfoldWarning: (owner: string) => `Si vous êtes ${owner}, ne cliquez pas : la surprise reste entière.`,
    eventPast: "Cet événement est passé : la liste reste à voir, mais on ne peut plus y participer.",
    next: (n: number, events: string) =>
      `Prochaine${n > 1 ? "s" : ""} occasion${n > 1 ? "s" : ""} : ${events}.`,
    /** « Noël (24 décembre) ». */
    eventOn: (name: string, day: string) => `${name} (${day})`,
    forEvent: (name: string) => `Pour ${name}.`,
    withdraw: "Me retirer",
    withdrawLabel: (title: string) => `Me retirer de « ${title} »`,
    thanks: (owner: string) => `Merci, c'est noté ! ${owner} n'en saura rien avant l'occasion.`,
    given: "Merci, c'est noté !",
    withdrawn: "C'est retiré.",
    unfolded: "Les cadeaux sont affichés.",
  },
  give: {
    close: "Fermer",
    event: "Pour quelle occasion ?",
    amount: "Votre participation, en euros",
    amountPlaceholder: "Par exemple 20",
    amountLeft: (left: string) => `Il manque ${left}. Vous pouvez donner plus ou moins.`,
    amountFree: "Le montant que vous voulez, même au-delà de l'objectif.",
    units: "Combien en offrez-vous ?",
    name: "Votre prénom",
    nameHelp: "Pour que vos proches sachent qui s'en occupe.",
    message: (owner: string) => `Un mot pour ${owner} (facultatif)`,
    messageHelp: "À lire après l'occasion, avec le cadeau.",
    anonymous: "Rester discret",
    anonymousHelp: (owner: string) => `Personne ne verra votre nom, pas même ${owner}.`,
    sending: "Envoi…",
  },
};
