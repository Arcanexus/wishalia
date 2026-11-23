import { describe, expect, it } from "vitest";

import { escapeHtml, magicLinkMail, smtpMailer } from "./mailer.js";

describe("magicLinkMail", () => {
  const url = "https://app.wishlist.test/auth/magic-link/verify?token=abc&callbackURL=%2F";

  it("gives the link in both parts, the HTML one escaped", () => {
    const mail = magicLinkMail("Chut", "a@x.test", url);
    expect(mail.to).toBe("a@x.test");
    expect(mail.subject).toBe("Votre lien de connexion à Chut");
    expect(mail.text).toContain(url);
    expect(mail.html).toContain(url.replaceAll("&", "&#38;"));
  });

  it("escapes the product name", () => {
    expect(magicLinkMail("<b>", "a@x.test", url).html).not.toContain("<b>");
  });
});

describe("escapeHtml", () => {
  it("escapes the five HTML characters", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&#60;a href=&#34;x&#34;&#62;&#39;&#38;&#39;&#60;/a&#62;");
  });
});

describe("smtpMailer", () => {
  it("reports a server it cannot reach", async () => {
    const mailer = smtpMailer("smtp://127.0.0.1:1", "wishlist <noreply@x.test>");
    await expect(mailer.send({ to: "a@x.test", subject: "s", text: "t", html: "h" })).rejects.toThrow();
  });
});
