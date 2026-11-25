/**
 * The emails of the API (apps/api/src/auth/mailer.ts). Plain words for every age; they say nothing
 * about any list, since an email may be read over a shoulder.
 */
export const mail = {
  magicLink: {
    subject: (app: string) => `Votre lien de connexion à ${app}`,
    hello: "Bonjour,",
    openLink: (app: string) => `Ouvrez ce lien pour vous connecter à ${app} :`,
    pressButton: (app: string) => `Appuyez sur le bouton pour vous connecter à ${app}.`,
    button: (app: string) => `Me connecter à ${app}`,
    orCopy: "Ou copiez ce lien dans votre navigateur :",
    once: "Il fonctionne une seule fois, pendant 15 minutes. Si vous n'avez rien demandé, ignorez cet e-mail.",
  },
};
