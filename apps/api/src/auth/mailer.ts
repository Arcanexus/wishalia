import { createTransport } from "nodemailer";

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/** Sends the emails of the API: today the magic links only. */
export interface Mailer {
  send(mail: Mail): Promise<void>;
}

/** SMTP through nodemailer: smtp://user:password@host:587 (STARTTLS) or smtps://... (TLS). */
export function smtpMailer(url: string, from: string): Mailer {
  const transport = createTransport(url);
  return {
    async send(mail) {
      await transport.sendMail({ from, ...mail });
    },
  };
}

/** Escapes text for the HTML part of an email. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);
}

/**
 * The magic link email. Plain words, a big button and the link written out too, for every age and
 * every mail client. It says nothing about any list: an email may be read over a shoulder.
 * French, the language of the people who use it; translations come with the i18n of the frontends.
 */
export function magicLinkMail(appName: string, to: string, url: string): Mail {
  const name = escapeHtml(appName);
  const href = escapeHtml(url);
  return {
    to,
    subject: `Votre lien de connexion à ${appName}`,
    text: `Bonjour,\n\nOuvrez ce lien pour vous connecter à ${appName} :\n\n${url}\n\nIl fonctionne une seule fois, pendant 15 minutes. Si vous n'avez rien demandé, ignorez cet e-mail.\n`,
    html: `<!doctype html><html lang="fr"><body style="font-family:system-ui,sans-serif;font-size:18px;line-height:1.5;color:#1f2933">
<p>Bonjour,</p>
<p>Appuyez sur le bouton pour vous connecter à ${name}.</p>
<p><a href="${href}" style="display:inline-block;padding:14px 28px;background:#1f5f8b;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">Me connecter à ${name}</a></p>
<p>Ou copiez ce lien dans votre navigateur :<br><a href="${href}">${href}</a></p>
<p>Il fonctionne une seule fois, pendant 15 minutes. Si vous n'avez rien demandé, ignorez cet e-mail.</p>
</body></html>`,
  };
}
