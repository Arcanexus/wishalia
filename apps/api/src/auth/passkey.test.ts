import { schema } from "@wishalia/db";
import { eq } from "drizzle-orm";
import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { createTestApp, OWNER_EMAIL, signIn, type TestApp } from "../test/app.js";
import {
  cbor,
  SoftwareAuthenticator,
  type AuthenticationOptions,
  type RegistrationOptions,
} from "../test/authenticator.js";

const APP = "https://app.wishalia.test";
const JSON_FROM_APP = { origin: APP, "content-type": "application/json" };
let t: TestApp;

beforeAll(async () => {
  t = await createTestApp();
}, 30_000);

afterAll(async () => {
  await t.close();
});

/** The cookies a response sets, as a Cookie header. */
function cookiesOf(response: LightMyRequestResponse): string {
  return [response.headers["set-cookie"] ?? []]
    .flat()
    .map((cookie) => cookie.split(";")[0])
    .join("; ");
}

const join = (...cookies: string[]) => cookies.filter(Boolean).join("; ");

/** Registers a passkey for the signed-in person, the way the settings page does. */
async function register(session: string, authenticator: SoftwareAuthenticator, name = "Mon téléphone") {
  const options = await t.app.inject({
    method: "GET",
    url: "/auth/passkey/generate-register-options",
    headers: { cookie: session, origin: APP },
  });
  expect(options.statusCode).toBe(200);
  const response = authenticator.register(options.json<RegistrationOptions>());
  return t.app.inject({
    method: "POST",
    url: "/auth/passkey/verify-registration",
    headers: { ...JSON_FROM_APP, cookie: join(session, cookiesOf(options)) },
    payload: { response, name },
  });
}

/** Signs in with a passkey, the way the sign-in page does: no session, no email. */
async function signInWith(authenticator: SoftwareAuthenticator) {
  const options = await t.app.inject({
    method: "GET",
    url: "/auth/passkey/generate-authenticate-options",
    headers: { origin: APP },
  });
  return t.app.inject({
    method: "POST",
    url: "/auth/passkey/verify-authentication",
    headers: { ...JSON_FROM_APP, cookie: cookiesOf(options) },
    payload: { response: authenticator.authenticate(options.json<AuthenticationOptions>()) },
  });
}

describe("the software authenticator", () => {
  it("writes CBOR the way RFC 8949 does", () => {
    expect(cbor(10).toString("hex")).toBe("0a");
    expect(cbor(500).toString("hex")).toBe("1901f4");
    expect(cbor(-7).toString("hex")).toBe("26");
    expect(cbor("a").toString("hex")).toBe("6161");
    expect(cbor([1, 2]).toString("hex")).toBe("820102");
    expect(cbor(new Uint8Array(30)).subarray(0, 2).toString("hex")).toBe("581e");
  });
});

describe("passkeys", () => {
  it("registers a passkey, then signs in with it, without an email", async () => {
    const session = await signIn(t, OWNER_EMAIL);
    const phone = new SoftwareAuthenticator(APP);
    const registered = await register(session, phone);
    expect(registered.statusCode).toBe(200);

    const signedIn = await signInWith(phone);
    expect(signedIn.statusCode).toBe(200);
    const cookie = cookiesOf(signedIn);
    expect(cookie).toContain("session_token=");
    const me = await t.app.inject({ method: "GET", url: "/manage/me", headers: { cookie } });
    expect(me.json()).toMatchObject({ email: OWNER_EMAIL });
  });

  it("asks for a passkey kept on the device, and offers no account to guess", async () => {
    const options = await t.app.inject({
      method: "GET",
      url: "/auth/passkey/generate-register-options",
      headers: { cookie: await signIn(t, OWNER_EMAIL), origin: APP },
    });
    expect(options.json()).toMatchObject({
      rp: { id: "app.wishalia.test", name: "Wishalia" },
      authenticatorSelection: { residentKey: "required" },
      attestation: "none",
    });

    const signInOptions = await t.app.inject({
      method: "GET",
      url: "/auth/passkey/generate-authenticate-options",
    });
    expect(signInOptions.json()).not.toHaveProperty("allowCredentials");
    const challengeCookie = [signInOptions.headers["set-cookie"] ?? []].flat().join("\n");
    expect(challengeCookie).toMatch(/HttpOnly/i);
  });

  it("needs a session, and a recent one, to add a passkey", async () => {
    const anonymous = await t.app.inject({
      method: "GET",
      url: "/auth/passkey/generate-register-options",
      headers: { origin: APP },
    });
    expect(anonymous.statusCode).toBe(401);

    const session = await signIn(t, OWNER_EMAIL);
    const token = decodeURIComponent(session.split("=")[1] ?? "").split(".")[0] ?? "";
    await t.db
      .update(schema.authSessions)
      .set({ createdAt: new Date(Date.now() - 2 * 24 * 3600 * 1000) })
      .where(eq(schema.authSessions.token, token));
    const stale = await t.app.inject({
      method: "GET",
      url: "/auth/passkey/generate-register-options",
      headers: { cookie: session, origin: APP },
    });
    expect(stale.statusCode).toBe(403);
    expect(stale.json()).toMatchObject({ code: "SESSION_NOT_FRESH" });
  });

  it("refuses a passkey it does not know, or a forged signature", async () => {
    expect((await signInWith(new SoftwareAuthenticator(APP))).statusCode).toBe(401);

    const session = await signIn(t, OWNER_EMAIL);
    const phone = new SoftwareAuthenticator(APP);
    await register(session, phone);
    const options = await t.app.inject({ method: "GET", url: "/auth/passkey/generate-authenticate-options" });
    const answer = phone.authenticate(options.json<AuthenticationOptions>());
    answer.response.signature = Buffer.from("not a signature").toString("base64url");
    const forged = await t.app.inject({
      method: "POST",
      url: "/auth/passkey/verify-authentication",
      headers: { ...JSON_FROM_APP, cookie: cookiesOf(options) },
      payload: { response: answer },
    });
    expect(forged.statusCode).toBe(400);
    expect(cookiesOf(forged)).not.toContain("session_token=");
  });

  it("refuses a passkey made for another site", async () => {
    const session = await signIn(t, OWNER_EMAIL);
    const elsewhere = new SoftwareAuthenticator("https://evil.example");
    expect((await register(session, elsewhere)).statusCode).toBe(400);
  });

  it("keeps each person's passkeys to them", async () => {
    await t.db.insert(schema.users).values({ email: "aunt@example.test", displayName: "Tatie" });
    const aunt = await signIn(t, "aunt@example.test");
    const owner = await signIn(t, OWNER_EMAIL);
    await register(aunt, new SoftwareAuthenticator(APP), "Tablette de Tatie");

    const list = await t.app.inject({
      method: "GET",
      url: "/auth/passkey/list-user-passkeys",
      headers: { cookie: owner },
    });
    const names = list.json<{ name: string }[]>().map((passkey) => passkey.name);
    expect(names).not.toContain("Tablette de Tatie");

    const [auntKey] = await t.db
      .select()
      .from(schema.authPasskeys)
      .where(eq(schema.authPasskeys.name, "Tablette de Tatie"));
    for (const [url, payload] of [
      ["/auth/passkey/delete-passkey", { id: auntKey?.id }],
      ["/auth/passkey/update-passkey", { id: auntKey?.id, name: "Volée" }],
    ] as const) {
      const response = await t.app.inject({
        method: "POST",
        url,
        headers: { ...JSON_FROM_APP, cookie: owner },
        payload,
      });
      expect(response.statusCode).toBeGreaterThanOrEqual(400);
    }
    const [still] = await t.db
      .select()
      .from(schema.authPasskeys)
      .where(eq(schema.authPasskeys.id, auntKey?.id ?? ""));
    expect(still?.name).toBe("Tablette de Tatie");
  });

  it("renames and deletes a passkey of one's own", async () => {
    const session = await signIn(t, OWNER_EMAIL);
    await register(session, new SoftwareAuthenticator(APP), "Ancien ordinateur");
    const [key] = await t.db
      .select()
      .from(schema.authPasskeys)
      .where(eq(schema.authPasskeys.name, "Ancien ordinateur"));
    const renamed = await t.app.inject({
      method: "POST",
      url: "/auth/passkey/update-passkey",
      headers: { ...JSON_FROM_APP, cookie: session },
      payload: { id: key?.id, name: "Ordinateur du salon" },
    });
    expect(renamed.statusCode).toBe(200);
    const deleted = await t.app.inject({
      method: "POST",
      url: "/auth/passkey/delete-passkey",
      headers: { ...JSON_FROM_APP, cookie: session },
      payload: { id: key?.id },
    });
    expect(deleted.statusCode).toBe(200);
    expect(
      await t.db
        .select()
        .from(schema.authPasskeys)
        .where(eq(schema.authPasskeys.id, key?.id ?? "")),
    ).toEqual([]);
  });
});
