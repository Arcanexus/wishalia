import type { Database } from "@wishalia/db";
import { createTestDb } from "@wishalia/db/testing";
import type { FastifyInstance } from "fastify";

import { buildApp } from "../app.js";
import type { Mail, Mailer } from "../auth/mailer.js";
import { loadConfig } from "../config.js";

export const OWNER_EMAIL = "owner@example.test";

export interface TestApp {
  app: FastifyInstance;
  db: Database;
  /** Every email the API sent, oldest first. */
  mails: Mail[];
  close: () => Promise<void>;
}

/** The API on an in-memory database, with a mailer that keeps the emails. */
export async function createTestApp(env: NodeJS.ProcessEnv = {}, now?: () => Date): Promise<TestApp> {
  const { db, close: closeDb } = await createTestDb();
  const mails: Mail[] = [];
  const mailer: Mailer = { send: async (mail) => void mails.push(mail) };
  const config = loadConfig({
    NODE_ENV: "test",
    APP_ORIGIN: "https://app.wishalia.test",
    PUBLIC_ORIGIN: "https://wishalia.test",
    AUTH_SECRET: "a-test-secret-that-is-long-enough-0123456789",
    OWNER_EMAILS: OWNER_EMAIL,
    ...env,
  });
  const app = await buildApp(config, { db, mailer, ...(now ? { now } : {}) });
  return {
    app,
    db,
    mails,
    close: async () => {
      await app.close();
      await closeDb();
    },
  };
}

/** The link of the last email: the magic link. */
export function lastLink(mails: Mail[]): URL {
  const match = mails.at(-1)?.text.match(/https:\/\/\S+/);
  if (!match) throw new Error("no link in the last email");
  return new URL(match[0]);
}

/** Signs in through a magic link and returns the Cookie header of the session. */
export async function signIn({ app, mails }: TestApp, email: string): Promise<string> {
  const ask = await app.inject({
    method: "POST",
    url: "/auth/sign-in/magic-link",
    headers: { origin: "https://app.wishalia.test", "content-type": "application/json" },
    payload: { email, callbackURL: "/" },
  });
  if (ask.statusCode !== 200) throw new Error(`magic link refused: ${ask.statusCode} ${ask.body}`);
  const link = lastLink(mails);
  const verify = await app.inject({ method: "GET", url: `${link.pathname}${link.search}` });
  const cookies = [verify.headers["set-cookie"] ?? []].flat();
  const session = cookies.find((cookie) => cookie.includes("session_token="));
  if (!session) throw new Error(`no session cookie: ${verify.statusCode} ${verify.headers.location ?? ""}`);
  return session.split(";")[0] ?? "";
}
