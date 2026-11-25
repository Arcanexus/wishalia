/**
 * The guests' view, shared by the public page and the owner's preview (packages/ui/src/public).
 * French is the source: other languages give the same keys (docs/i18n.md).
 */
export const view = {
  defaultHeading: "Liste de souhaits",
  /** « une personne discrète », « 3 personnes discrètes »: givers who stay anonymous. */
  discreet: (n: number) => (n === 1 ? "une personne discrète" : `${n} personnes discrètes`),
  receivedThanks: "Déjà reçu : merci !",
  repeatGiven: (times: number) =>
    `Déjà offert ${times === 1 ? "une fois" : `${times} fois`}, et peut l'être encore.`,
  repeatFree: "Libre, et peut être offert à chaque occasion.",
  reservedBy: (who: string) => `Réservé par ${who}.`,
  reserved: "Déjà réservé.",
  free: "Libre.",
  allReservedBy: (who: string) => `Tout est réservé, par ${who}.`,
  allReserved: "Tout est réservé.",
  noneReserved: (wanted: number) => `${wanted} à offrir, aucun réservé pour l'instant.`,
  someReserved: (taken: number, wanted: number, who: string) =>
    `${taken} sur ${wanted} déjà réservé${taken > 1 ? "s" : ""}${who ? `, par ${who}` : ""}.`,
  poolToStart: (target: string | null) => (target ? `Cagnotte de ${target}, à lancer.` : "Cagnotte à lancer."),
  poolReached: (total: string, target: string | null) =>
    target ? `${total} réunis sur ${target}` : `${total} réunis`,
  poolOvershoot: (amount: string) => ` : objectif atteint, ${amount} en excédent`,
  poolMissing: (amount: string) => ` : il manque ${amount}`,
  poolWith: (who: string) => `, avec ${who}`,
  giveLabel: { pool: "Je participe", several: "J'en réserve", one: "Je le réserve" },
  giveErrors: {
    already_reserved: "Quelqu'un vient de le réserver. Regardez les autres envies !",
    not_enough_left: "Il n'en reste plus autant : choisissez un nombre plus petit.",
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
  gaugeFree: (n: number) => `${n} libre${n > 1 ? "s" : ""}`,
  /** The legend of a pool's bar: « Noël : 40 € ». */
  segment: (label: string, amount: string) => `${label} : ${amount}`,
  kind: { quantity: "Plusieurs exemplaires", pool: "Cagnotte" },
  wanted: (n: number) => `${n} souhaités`,
  everyOccasion: "À chaque occasion",
  seeOn: (site: string) => `Voir sur ${site}`,
  newTab: " (nouvel onglet)",
  forEvents: (names: string) => `Pour ${names}`,
  almost: "Presque complet",
  /** The made-up givers of the owner's preview: plainly examples. */
  sampleNames: ["Camille (exemple)", "Hugo (exemple)"] as [string, string],
};
