/**
 * The guests' view, shared by the public page and the owner's preview (packages/ui/src/public).
 * French is the source: other languages give the same keys (docs/i18n.md).
 */
export const view = {
  defaultHeading: "Liste de souhaits",
  /** « une personne discrète », « 3 personnes discrètes »: givers who stay anonymous. */
  discreet: (n: number) => (n === 1 ? "une personne discrète" : `${n} personnes discrètes`),
  receivedThanks: "Déjà reçu : merci !",
  /** While the app completes the item from its link: its title, price or image are on their way. */
  updating: "Mise à jour depuis le lien…",
  updated: (title: string) => `« ${title} » est à jour.`,
  /**
   * Where an item stands, told by the badge's icon and colour; these words are its accessible name
   * only (spoken, or shown on hover), never written on the card.
   */
  status: {
    free: "Personne ne s'en occupe encore",
    progress: "En partie offert",
    done: "Déjà offert",
    received: "Déjà reçu",
  },
  repeatGiven: (times: number) =>
    `Déjà offert ${times === 1 ? "une fois" : `${times} fois`}, et peut l'être encore.`,
  reservedBy: (who: string) => `Réservé par ${who}.`,
  reserved: "Déjà réservé.",
  sharedBy: (who: string) => `Offert ensemble, par ${who}.`,
  shared: "Offert ensemble.",
  allReservedBy: (who: string) => `Tout est réservé, par ${who}.`,
  allReserved: "Tout est réservé.",
  someReserved: (taken: number, wanted: number, who: string) =>
    `${taken} sur ${wanted} déjà réservé${taken > 1 ? "s" : ""}${who ? `, par ${who}` : ""}.`,
  poolToStart: (target: string | null) =>
    target ? `Cagnotte de ${target}, à lancer.` : "Cagnotte à lancer.",
  poolReached: (total: string, target: string | null) =>
    target ? `${total} réunis sur ${target}` : `${total} réunis`,
  poolOvershoot: (amount: string) => ` : objectif atteint, ${amount} en excédent`,
  poolMissing: (amount: string) => ` : il manque ${amount}`,
  poolWith: (who: string) => `, avec ${who}`,
  /** The one button of every item a guest can still give: its form then asks what that item needs. */
  giveLabel: "Acheter / Participer",
  giveErrors: {
    already_reserved: "Quelqu'un vient de le réserver. Regardez les autres envies !",
    not_enough_left: "Il n'en reste plus autant : choisissez un nombre plus petit.",
    already_shared: "D'autres participent déjà : complétez avec le montant de votre choix.",
    amount_too_high: "C'est plus que ce qu'il manque : choisissez un montant plus petit.",
    shares_not_taken: "Ce cadeau se réserve en entier.",
    series_by_volume: "Une série s'offre tome par tome : choisissez un tome.",
    amount_required: "Indiquez un montant, par exemple 20 ou 12,50.",
    units_required: "Indiquez combien vous en offrez.",
    name_required: "Indiquez votre prénom, pour que vos proches sachent qui s'en occupe.",
    too_long: "Le prénom fait 60 caractères au plus, et le mot 500.",
    event_closed: "Cette occasion est passée : on ne peut plus y participer.",
    item_closed: "Cette envie n'attend plus de cadeau.",
    list_closed: "Cette envie n'attend plus de cadeau.",
    invalid_request: "Vérifiez ce que vous avez écrit, puis réessayez.",
  } as Record<string, string>,
  withdrawErrors: {
    event_closed: "L'occasion est passée : ce cadeau ne peut plus être retiré.",
    item_closed: "Cette envie est déjà reçue : ce cadeau ne peut plus être retiré.",
    list_closed: "Le secret est levé : ce cadeau ne peut plus être retiré.",
  } as Record<string, string>,
  tryAgain: "Ça n'a pas marché. Réessayez dans un instant.",
  myGiftAmount: (amount: string) => `Vous participez pour ${amount}.`,
  myGiftUnits: (units: number) => (units === 1 ? "Vous en réservez un." : `Vous en réservez ${units}.`),
  myGiftReserved: "Vous l'avez réservé.",
  otherEvent: "Une autre occasion",
  noEvent: "Sans occasion",
  gaugeComplete: (n: number) => `${n} complet${n > 1 ? "s" : ""}`,
  gaugeInProgress: (n: number) => `${n} en cours`,
  gaugeFree: (n: number) => `${n} à offrir`,
  /** The legend of a pool's bar: « Noël : 40 € ». */
  segment: (label: string, amount: string) => `${label} : ${amount}`,
  kind: { quantity: "Plusieurs exemplaires", pool: "Cagnotte", series: "Série" },
  /** A series' card (docs/series.md): its volumes, given one by one. */
  series: {
    volumes: (n: number) => `${n} tome${n > 1 ? "s" : ""}`,
    left: (left: number, total: number) =>
      left === 0
        ? "Tous les tomes sont offerts."
        : left === total
          ? `${total === 1 ? "Le tome attend" : `Les ${total} tomes attendent`} un cadeau.`
          : `${left} tome${left > 1 ? "s" : ""} sur ${total} encore à offrir.`,
    listLabel: (title: string) => `Les tomes de « ${title} »`,
  },
  wanted: (n: number) => `${n} souhaités`,
  everyOccasion: "À chaque occasion",
  seeOn: (site: string) => `Voir sur ${site}`,
  newTab: " (nouvel onglet)",
  forEvents: (names: string) => `Pour ${names}`,
  almost: "Presque complet",
  /** The made-up givers of the owner's preview: plainly examples. */
  sampleNames: ["Camille (exemple)", "Hugo (exemple)"] as [string, string],
  page: {
    welcome: "Bienvenue !",
    hello: (who: string) => `Bonjour ${who} !`,
    wishesOf: (owner: string) => `Les envies de ${owner}.`,
    wishesOfFor: (owner: string, day: string) => `Les envies de ${owner}, pour le ${day}.`,
    gaugeList: "Où en est la liste",
    gaugeEvent: "Où en est l'occasion",
    empty: "La liste est vide pour l'instant. Revenez un peu plus tard !",
  },
};
