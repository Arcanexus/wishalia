import type { MailMessages } from "../mail.js";

export const mail: MailMessages = {
  magicLink: {
    subject: (app) => `Your sign-in link for ${app}`,
    hello: "Hello,",
    openLink: (app) => `Open this link to sign in to ${app}:`,
    pressButton: (app) => `Press the button to sign in to ${app}.`,
    button: (app) => `Sign me in to ${app}`,
    orCopy: "Or copy this link into your browser:",
    once: "It works only once, for 15 minutes. If you did not ask for it, ignore this email.",
  },
};
