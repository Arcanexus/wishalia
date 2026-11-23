import { schema } from "@wishlist/db";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { loadConfig } from "../config.js";
import { createTestApp, lastLink, OWNER_EMAIL, signIn, type TestApp } from "../test/app.js";
import { createAuth, mayCreateAccount } from "./auth.js";

const ORIGIN = { origin: "https://app.wishlist.test", "content-type": "application/json" };
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
}, 30_000);

afterAll(async () => {
  await t.close();
});

describe("invitation only", () => {
  it("lets the owners create their account, case and spaces aside", () => {
    const config = loadConfig({ OWNER_EMAILS: " Owner@Example.test , other@example.test" });
    expect(mayCreateAccount(config, "owner@example.test")).toBe(true);
    expect(mayCreateAccount(config, " OWNER@example.TEST ")).toBe(true);
    expect(mayCreateAccount(config, "stranger@example.test")).toBe(false);
    expect(mayCreateAccount(config, null)).toBe(false);
  });

  it("creates no account for a stranger who asks for a magic link", async () => {
    const before = await t.db.select().from(schema.users);
    const mailsBefore = t.mails.length;
    await t.app.inject({
      method: "POST",
      url: "/auth/sign-in/magic-link",
      headers: ORIGIN,
      payload: { email: "stranger@example.test" },
    });
    if (t.mails.length > mailsBefore) {
      const link = lastLink(t.mails);
      const verify = await t.app.inject({ method: "GET", url: `${link.pathname}${link.search}` });
      expect(String(verify.headers["set-cookie"] ?? "")).not.toContain("session_token=");
    }
    expect(await t.db.select().from(schema.users)).toHaveLength(before.length);
  });
});

describe("magic link", () => {
  it("signs the owner in, and /manage knows them", async () => {
    const cookie = await signIn(t, OWNER_EMAIL);
    const me = await t.app.inject({ method: "GET", url: "/manage/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({ email: OWNER_EMAIL });
  });

  it("signs an invited relative in, whose account already exists", async () => {
    await t.db.insert(schema.users).values({ email: "grandma@example.test", displayName: "Mamie" });
    const cookie = await signIn(t, "grandma@example.test");
    const me = await t.app.inject({ method: "GET", url: "/manage/me", headers: { cookie } });
    expect(me.json()).toMatchObject({ email: "grandma@example.test", displayName: "Mamie" });
  });

  it("works once", async () => {
    await signIn(t, OWNER_EMAIL);
    const link = lastLink(t.mails);
    const again = await t.app.inject({ method: "GET", url: `${link.pathname}${link.search}` });
    expect(String(again.headers["set-cookie"] ?? "")).not.toContain("session_token=");
  });

  it("stores only a hash of the token", async () => {
    await signIn(t, OWNER_EMAIL);
    const token = lastLink(t.mails).searchParams.get("token") ?? "";
    const rows = await t.db.select().from(schema.authVerifications);
    expect(token).not.toBe("");
    expect(JSON.stringify(rows)).not.toContain(token);
  });

  it("sends a plain email that says nothing about any list", async () => {
    await signIn(t, OWNER_EMAIL);
    const mail = t.mails.at(-1);
    expect(mail?.to).toBe(OWNER_EMAIL);
    expect(mail?.subject).toContain("wishlist");
    expect(mail?.html).toContain('lang="fr"');
  });

  it("refuses to redirect to another site after sign-in", async () => {
    const response = await t.app.inject({
      method: "POST",
      url: "/auth/sign-in/magic-link",
      headers: ORIGIN,
      payload: { email: OWNER_EMAIL, callbackURL: "https://evil.example/" },
    });
    expect(response.statusCode).toBe(403);
  });

  it("refuses a signed-in request from an untrusted origin (CSRF)", async () => {
    const cookie = await signIn(t, OWNER_EMAIL);
    const response = await t.app.inject({
      method: "POST",
      url: "/auth/sign-out",
      headers: { origin: "https://evil.example", "content-type": "application/json", cookie },
      payload: {},
    });
    expect(response.statusCode).toBe(403);
    const me = await t.app.inject({ method: "GET", url: "/manage/me", headers: { cookie } });
    expect(me.statusCode).toBe(200);
  });
});

describe("session cookie", () => {
  it("is __Secure-, HttpOnly and SameSite=Lax over https", async () => {
    const cookie = await signInCookieHeader(t);
    expect(cookie).toMatch(/^__Secure-wishlist\.session_token=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
    expect(cookie).not.toMatch(/Domain=/i);
  });

  it("is shared by the two hosts with COOKIE_DOMAIN", async () => {
    const shared = await createTestApp({ COOKIE_DOMAIN: "wishlist.test" });
    try {
      expect(await signInCookieHeader(shared)).toMatch(/Domain=\.?wishlist\.test/i);
    } finally {
      await shared.close();
    }
  }, 30_000);

  it("signs out", async () => {
    const cookie = await signIn(t, OWNER_EMAIL);
    const out = await t.app.inject({
      method: "POST",
      url: "/auth/sign-out",
      headers: { ...ORIGIN, cookie },
      payload: {},
    });
    expect(out.statusCode).toBe(200);
    const me = await t.app.inject({ method: "GET", url: "/manage/me", headers: { cookie } });
    expect(me.statusCode).toBe(401);
  });
});

describe("the /manage guard", () => {
  it("answers 401 without a session", async () => {
    const response = await t.app.inject({ method: "GET", url: "/manage/me" });
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "unauthenticated" });
  });

  it("answers 401 with a forged cookie", async () => {
    const response = await t.app.inject({
      method: "GET",
      url: "/manage/ping",
      headers: { cookie: "__Secure-wishlist.session_token=forged.value" },
    });
    expect(response.statusCode).toBe(401);
  });
});

/** The full Set-Cookie header of a fresh session (signIn only keeps name=value). */
async function signInCookieHeader(app: TestApp): Promise<string> {
  await app.app.inject({
    method: "POST",
    url: "/auth/sign-in/magic-link",
    headers: ORIGIN,
    payload: { email: OWNER_EMAIL },
  });
  const link = lastLink(app.mails);
  const verify = await app.app.inject({ method: "GET", url: `${link.pathname}${link.search}` });
  return (
    [verify.headers["set-cookie"] ?? []].flat().find((cookie) => cookie.includes("session_token=")) ?? ""
  );
}

describe("sign-in methods", () => {
  const plugins = (env: NodeJS.ProcessEnv, mailer = false) =>
    createAuth({
      config: loadConfig(env),
      db: t.db,
      ...(mailer ? { mailer: { send: async () => {} } } : {}),
    }).options.plugins.map((plugin) => plugin.id);

  it("always offers passkeys, never passwords", () => {
    expect(plugins({ NODE_ENV: "test" })).toContain("passkey");
    expect(createAuth({ config: loadConfig({}), db: t.db }).options.emailAndPassword.enabled).toBe(false);
  });

  it("offers OIDC once configured", () => {
    expect(plugins({ NODE_ENV: "test" })).not.toContain("generic-oauth");
    expect(
      plugins({ OIDC_ISSUER: "https://sso.example/", OIDC_CLIENT_ID: "id", OIDC_CLIENT_SECRET: "secret" }),
    ).toContain("generic-oauth");
  });

  it("offers magic links with a mailer, or logs them in development", () => {
    expect(plugins({ NODE_ENV: "test" })).not.toContain("magic-link");
    expect(plugins({ NODE_ENV: "test" }, true)).toContain("magic-link");
    expect(plugins({ NODE_ENV: "development" })).toContain("magic-link");
  });

  it("logs the magic link in development", async () => {
    const logged: string[] = [];
    const auth = createAuth({
      config: loadConfig({ NODE_ENV: "development", OWNER_EMAILS: OWNER_EMAIL }),
      db: t.db,
      log: (message) => logged.push(message),
    });
    await auth.handler(
      new Request("http://localhost:3003/auth/sign-in/magic-link", {
        method: "POST",
        headers: { origin: "http://localhost:3003", "content-type": "application/json" },
        body: JSON.stringify({ email: OWNER_EMAIL }),
      }),
    );
    expect(logged[0]).toContain("http://localhost:3003/auth/magic-link/verify?token=");
  });
});
