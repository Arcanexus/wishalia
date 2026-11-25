import { describe, expect, it } from "vitest";

import { escapeHtml, magicLinkMail, smtpMailer } from "./mailer.js";

describe("magicLinkMail", () => {
  const url = "https://app.wishalia.test/auth/magic-link/verify?token=abc&callbackURL=%2F";

  it("gives the link in both parts, the HTML one escaped", () => {
    const mail = magicLinkMail("Chut", "a@x.test", url, "fr");
    expect(mail.to).toBe("a@x.test");
    expect(mail.subject).toBe("Votre lien de connexion à Chut");
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url.replaceAll("&", "&#38;"));
  });

  it("escapes the product name", () => {
    expect(magicLinkMail("<b>", "a@x.test", url, "fr").html).not.toContain("<b>");
  });

  it("speaks the person's language", () => {
    const mail = magicLinkMail("Chut", "a@x.test", url, "en");
    expect(mail.subject).toBe("Your sign-in link for Chut");
    expect(mail.text).toContain("It works only once");
    expect(mail.html).toContain('<html lang="en-GB">');
    expect(mail.html).toContain("Sign me in to Chut");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;");
  });
});

describe("smtpMailer", () => {
  it("reports a server it cannot reach", async () => {
    const mailer = smtpMailer("smtp://127.0.0.1:1", "wishalia <noreply@x.test>");
    await expect(mailer.send({ to: "a@x.test", subject: "s", text: "t", html: "h" })).rejects.toThrow();
  });
});
