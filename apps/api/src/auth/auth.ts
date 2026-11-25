import { randomBytes } from "node:crypto";

import { passkey } from "@better-auth/passkey";
import type { Database } from "@wishalia/db";
import { schema } from "@wishalia/db";
import { parseLocale, resolveLocale, type Locale } from "@wishalia/i18n";
import { betterAuth, type BetterAuthPlugin } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { genericOAuth } from "better-auth/plugins/generic-oauth";
import { magicLink } from "better-auth/plugins/magic-link";
import { eq } from "drizzle-orm";

import type { Config } from "../config.js";
import { magicLinkMail, type Mailer } from "./mailer.js";

/** Where Better Auth answers, on the API and behind the management app (/auth/* is proxied). */
export const AUTH_BASE_PATH = "/auth";
/** Id of the OIDC provider of the owners, in its callback URL: /auth/callback/oidc. */
export const OIDC_PROVIDER_ID = "oidc";
export const SESSION_DAYS = 30;
const MAGIC_LINK_MINUTES = 15;

export interface AuthDeps {
  config: Config;
  db: Database;
  /** Unset: magic links are off (SMTP_URL missing), except in development where they are logged. */
  mailer?: Mailer | undefined;
  log?: (message: string) => void;
  /** Shared with the device markers; authSecret(config) when left out. */
  secret?: string;
}

/**
 * Who may create an account by themselves: the owners listed in OWNER_EMAILS. Family members are
 * invited (their account is created for them), so a magic link to any other address signs nobody up.
 */
export function mayCreateAccount(config: Config, email: string | null | undefined): boolean {
  return !!email && config.OWNER_EMAILS.includes(email.trim().toLowerCase());
}

/**
 * The language of a person's emails (docs/i18n.md): the one kept with their account, then the
 * page's that asked for the email (the app sends it as Accept-Language), then DEFAULT_LOCALE.
 */
export async function mailLocale(
  db: Database,
  config: Config,
  email: string,
  acceptLanguage: string | null | undefined,
): Promise<Locale> {
  const [row] = await db
    .select({ locale: schema.users.locale })
    .from(schema.users)
    .where(eq(schema.users.email, email.trim().toLowerCase()))
    .limit(1);
  return resolveLocale({
    choice: parseLocale(row?.locale),
    acceptLanguage,
    fallback: config.DEFAULT_LOCALE,
  });
}

/**
 * The secret of the cookies and of the device markers: AUTH_SECRET, or a throwaway one outside
 * production (loadConfig requires it there). Computed once per process by buildApp.
 */
export function authSecret(config: Config): string {
  return config.AUTH_SECRET ?? randomBytes(32).toString("base64url");
}

/**
 * Better Auth, configured for the spec: OIDC for the owners, passkeys then magic links for the
 * family, no password at all. The session cookie is `__Secure-` in production and shared by the
 * two hosts through COOKIE_DOMAIN (a `__Host-` cookie cannot carry a Domain).
 */
export function createAuth({ config, db, mailer, log = () => {}, secret = authSecret(config) }: AuthDeps) {
  const secure = config.APP_ORIGIN.startsWith("https://");
  const rpID = config.COOKIE_DOMAIN?.replace(/^\./, "") ?? new URL(config.APP_ORIGIN).hostname;

  const sendMagicLink =
    mailer ??
    (config.NODE_ENV === "development"
      ? {
          send: async (mail: { to: string; text: string }) => log(`magic link for ${mail.to}:\n${mail.text}`),
        }
      : undefined);

  const plugins: BetterAuthPlugin[] = [
    passkey({
      rpID,
      rpName: config.APP_NAME,
      origin: [config.APP_ORIGIN, config.PUBLIC_ORIGIN],
      // Kept on the device (discoverable): signing in asks for no email, only the fingerprint, face or PIN
      authenticatorSelection: { residentKey: "required", userVerification: "preferred" },
    }),
  ];
  if (sendMagicLink) {
    plugins.push(
      magicLink({
        expiresIn: MAGIC_LINK_MINUTES * 60,
        allowedAttempts: 1,
        storeToken: "hashed",
        // Sign-up stays on: the user.create hook below lets the owners in, and nobody else
        sendMagicLink: async ({ email, url }, ctx) => {
          const headers = ctx?.headers ?? ctx?.request?.headers;
          const locale = await mailLocale(db, config, email, headers?.get("accept-language"));
          await sendMagicLink.send(magicLinkMail(config.APP_NAME, email, url, locale));
        },
      }),
    );
  }
  if (config.OIDC_ISSUER && config.OIDC_CLIENT_ID && config.OIDC_CLIENT_SECRET) {
    plugins.push(
      genericOAuth({
        config: [
          {
            providerId: OIDC_PROVIDER_ID,
            discoveryUrl: `${config.OIDC_ISSUER.replace(/\/$/, "")}/.well-known/openid-configuration`,
            clientId: config.OIDC_CLIENT_ID,
            clientSecret: config.OIDC_CLIENT_SECRET,
            scopes: ["openid", "email", "profile"],
            pkce: true,
          },
        ],
      }),
    );
  }

  return betterAuth({
    appName: config.APP_NAME,
    baseURL: config.APP_ORIGIN,
    basePath: AUTH_BASE_PATH,
    secret,
    trustedOrigins: [config.APP_ORIGIN, config.PUBLIC_ORIGIN],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.users,
        session: schema.authSessions,
        account: schema.authAccounts,
        verification: schema.authVerifications,
        passkey: schema.authPasskeys,
      },
    }),
    user: { fields: { name: "displayName" } },
    // No password, ever (spec §9)
    emailAndPassword: { enabled: false },
    account: {
      encryptOAuthTokens: true,
      accountLinking: { enabled: true, trustedProviders: [OIDC_PROVIDER_ID] },
    },
    // freshAge: adding a passkey needs a sign-in of less than a day, so a stolen old session cannot
    session: { expiresIn: SESSION_DAYS * 24 * 3600, updateAge: 24 * 3600, freshAge: 24 * 3600 },
    rateLimit: { enabled: config.NODE_ENV !== "test", window: 60, max: 30 },
    advanced: {
      // Better Auth skips its origin and CSRF checks under test by default: always on here, so that
      // the tests check what production runs
      disableOriginCheck: false,
      cookiePrefix: "wishalia",
      useSecureCookies: secure,
      ...(config.COOKIE_DOMAIN
        ? { crossSubDomainCookies: { enabled: true, domain: config.COOKIE_DOMAIN } }
        : {}),
      database: { generateId: "uuid" },
      // The frontends proxy /auth/* and set it from the client address; the API is not reachable otherwise
      ipAddress: { ipAddressHeaders: ["x-forwarded-for"] },
    },
    databaseHooks: {
      user: {
        create: {
          before: async (user) => {
            if (!mayCreateAccount(config, user.email)) {
              throw new APIError("FORBIDDEN", { message: "invitation only" });
            }
            return { data: { ...user, email: user.email.trim().toLowerCase() } };
          },
        },
      },
    },
    plugins,
  });
}

export type Auth = ReturnType<typeof createAuth>;
