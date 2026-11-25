import { LOCALE_TAGS, type Locale } from "@wishalia/i18n";
import { mailMessages } from "@wishalia/i18n/messages/mail";
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
 * The magic link email, in the person's language (docs/i18n.md). Plain words, a big button and the
 * link written out too, for every age and every mail client. It says nothing about any list: an
 * email may be read over a shoulder.
 */
export function magicLinkMail(appName: string, to: string, url: string, locale: Locale): Mail {
  const m = mailMessages(locale).magicLink;
  const name = escapeHtml(appName);
  const href = escapeHtml(url);
  return {
    to,
    subject: m.subject(appName),
    text: `${m.hello}\n\n${m.openLink(appName)}\n\n${url}\n\n${m.once}\n`,
    html: `<!doctype html><html lang="${LOCALE_TAGS[locale]}"><body style="font-family:system-ui,sans-serif;font-size:18px;line-height:1.5;color:#1f2933">
<p>${escapeHtml(m.hello)}</p>
<p>${escapeHtml(m.pressButton(appName))}</p>
<p><a href="${href}" style="display:inline-block;padding:14px 28px;background:#1f5f8b;color:#ffffff;border-radius:8px;text-decoration:none;font-weight:600">${escapeHtml(m.button(appName))}</a></p>
<p>${escapeHtml(m.orCopy)}<br><a href="${href}">${href}</a></p>
<p>${escapeHtml(m.once)}</p>
</body></html>`,
  };
}
