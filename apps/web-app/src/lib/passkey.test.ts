import { WebAuthnError } from "@simplewebauthn/browser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { addPasskey, deviceName, outcomeOf, passkeysSupported, signInWithPasskey } from "./passkey.ts";

afterEach(() => {
  vi.unstubAllGlobals();
});

const json = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), { status, headers: { "content-type": "application/json" } });

/** A browser fetch that answers by path, and records what was sent. */
function api(routes: Record<string, () => Response>) {
  const calls: { path: string; body: unknown }[] = [];
  const fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const path = url.split("?")[0] ?? url;
    calls.push({ path: url, body: typeof init.body === "string" ? JSON.parse(init.body) : undefined });
    return routes[path]?.() ?? json({}, 404);
  }) as unknown as typeof globalThis.fetch;
  return { fetch, calls };
}

const domError = (name: string) => Object.assign(new Error(name), { name });

describe("adding a passkey", () => {
  const routes = {
    "/auth/passkey/generate-register-options": () => json({ challenge: "c" }),
    "/auth/passkey/verify-registration": () => json({ id: "k" }),
  };

  it("runs the ceremony and sends the answer with its name", async () => {
    const { fetch, calls } = api(routes);
    const startRegistration = vi.fn(async () => ({ id: "cred" }) as never);
    expect(await addPasskey("Mon Mac", { fetch, startRegistration })).toBe("ok");
    expect(calls[0]?.path).toBe("/auth/passkey/generate-register-options?name=Mon%20Mac");
    expect(startRegistration).toHaveBeenCalledWith({ optionsJSON: { challenge: "c" } });
    expect(calls[1]?.body).toEqual({ response: { id: "cred" }, name: "Mon Mac" });
  });

  it("asks for a recent sign-in when the session is old", async () => {
    const { fetch } = api({
      "/auth/passkey/generate-register-options": () => json({ code: "SESSION_NOT_FRESH" }, 403),
    });
    expect(await addPasskey("x", { fetch, startRegistration: vi.fn() })).toBe("not_fresh");
  });

  it("tells a cancelled prompt, a device already registered and a failure apart", async () => {
    const failing = (error: unknown) => vi.fn(async () => Promise.reject(error));
    const { fetch } = api(routes);
    expect(await addPasskey("x", { fetch, startRegistration: failing(domError("NotAllowedError")) })).toBe(
      "cancelled",
    );
    const registered = new WebAuthnError({
      message: "already",
      code: "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED",
      cause: domError("InvalidStateError"),
    });
    expect(await addPasskey("x", { fetch, startRegistration: failing(registered) })).toBe("exists");
    expect(await addPasskey("x", { fetch: api({}).fetch, startRegistration: vi.fn() })).toBe("failed");
    const refused = api({ ...routes, "/auth/passkey/verify-registration": () => json({}, 400) });
    expect(
      await addPasskey("x", { fetch: refused.fetch, startRegistration: vi.fn(async () => ({}) as never) }),
    ).toBe("failed");
  });
});

describe("signing in with a passkey", () => {
  const routes = {
    "/auth/passkey/generate-authenticate-options": () => json({ challenge: "c" }),
    "/auth/passkey/verify-authentication": () => json({ session: {} }),
  };

  it("runs the ceremony, in the email field's suggestions when asked", async () => {
    const { fetch, calls } = api(routes);
    const startAuthentication = vi.fn(async () => ({ id: "cred" }) as never);
    expect(await signInWithPasskey({ autofill: true }, { fetch, startAuthentication })).toBe("ok");
    expect(startAuthentication).toHaveBeenCalledWith({
      optionsJSON: { challenge: "c" },
      useBrowserAutofill: true,
    });
    expect(calls[1]?.body).toEqual({ response: { id: "cred" } });
  });

  it("says when the passkey no longer opens an account", async () => {
    const { fetch } = api({
      ...routes,
      "/auth/passkey/verify-authentication": () => json({ code: "PASSKEY_NOT_FOUND" }, 401),
    });
    const startAuthentication = vi.fn(async () => ({}) as never);
    expect(await signInWithPasskey({}, { fetch, startAuthentication })).toBe("unknown_key");
  });

  it("stays quiet when the prompt is closed or replaced, and fails otherwise", async () => {
    const aborted = new WebAuthnError({
      message: "aborted",
      code: "ERROR_CEREMONY_ABORTED",
      cause: domError("AbortError"),
    });
    const { fetch } = api(routes);
    expect(
      await signInWithPasskey({}, { fetch, startAuthentication: vi.fn(async () => Promise.reject(aborted)) }),
    ).toBe("cancelled");
    expect(await signInWithPasskey({}, { fetch: api({}).fetch, startAuthentication: vi.fn() })).toBe(
      "failed",
    );
    const refused = api({ ...routes, "/auth/passkey/verify-authentication": () => json({}, 400) });
    expect(
      await signInWithPasskey(
        {},
        { fetch: refused.fetch, startAuthentication: vi.fn(async () => ({}) as never) },
      ),
    ).toBe("failed");
  });
});

describe("outcomeOf", () => {
  it("reads the browser's errors", () => {
    expect(outcomeOf(domError("InvalidStateError"))).toBe("exists");
    expect(outcomeOf(domError("SecurityError"))).toBe("failed");
    expect(outcomeOf("weird")).toBe("failed");
  });
});

describe("passkeysSupported", () => {
  it("is false without WebAuthn, true with it", () => {
    vi.stubGlobal("PublicKeyCredential", undefined);
    expect(passkeysSupported()).toBe(false);
    vi.stubGlobal("PublicKeyCredential", function PublicKeyCredential() {});
    expect(passkeysSupported()).toBe(true);
  });
});

describe("deviceName", () => {
  it.each([
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", "iPhone"],
    ["Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)", "iPad"],
    ["Mozilla/5.0 (Linux; Android 15; Pixel 9)", "Téléphone Android"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 15_0)", "Mac"],
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64)", "Ordinateur Windows"],
    ["Mozilla/5.0 (X11; CrOS x86_64 16000.0.0)", "Chromebook"],
    ["Mozilla/5.0 (X11; Linux x86_64)", "Ordinateur Linux"],
    ["curl/8", "Cet appareil"],
  ])("names %s « %s »", (agent, name) => {
    expect(deviceName(agent)).toBe(name);
  });
});
