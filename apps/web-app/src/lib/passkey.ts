import {
  browserSupportsWebAuthn,
  browserSupportsWebAuthnAutofill,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from "@simplewebauthn/browser";
import type { Locale } from "@wishalia/i18n";
import { appMessages } from "@wishalia/i18n/messages/app";

/**
 * The two WebAuthn ceremonies, in the browser. They talk to /auth/passkey on this host, which the
 * app proxies to the API: the challenge lives in an HttpOnly cookie, never in the page.
 */

export type PasskeyOutcome =
  | "ok"
  /** This browser has no passkeys. */
  | "unsupported"
  /** The person closed the prompt, or it timed out: nothing to say. */
  | "cancelled"
  /** Adding a passkey needs a sign-in of less than a day. */
  | "not_fresh"
  /** This device already holds a passkey of this account. */
  | "exists"
  /** The passkey was deleted from the account, or belongs to another site. */
  | "unknown_key"
  | "failed";

export interface PasskeyDeps {
  fetch?: typeof fetch;
  startRegistration?: typeof startRegistration;
  startAuthentication?: typeof startAuthentication;
}

const BASE = "/auth/passkey";

async function codeOf(response: Response): Promise<string> {
  const payload = (await response.json().catch(() => null)) as { code?: string } | null;
  return payload?.code ?? "";
}

/** What a failed ceremony means for the person. */
export function outcomeOf(failure: unknown): PasskeyOutcome {
  if (failure instanceof WebAuthnError && failure.code === "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED") {
    return "exists";
  }
  const name =
    failure instanceof Error ? (failure.cause instanceof Error ? failure.cause.name : failure.name) : "";
  if (name === "NotAllowedError" || name === "AbortError") return "cancelled";
  if (name === "InvalidStateError") return "exists";
  return "failed";
}

export function passkeysSupported(): boolean {
  return browserSupportsWebAuthn();
}

export function passkeyAutofillSupported(): Promise<boolean> {
  return browserSupportsWebAuthnAutofill();
}

/** Adds a passkey to the signed-in account: the device asks for the fingerprint, face or PIN. */
export async function addPasskey(name: string, deps: PasskeyDeps = {}): Promise<PasskeyOutcome> {
  const { fetch: send = fetch, startRegistration: register = startRegistration } = deps;
  const options = await send(`${BASE}/generate-register-options?name=${encodeURIComponent(name)}`);
  if (options.status === 403 && (await codeOf(options)) === "SESSION_NOT_FRESH") return "not_fresh";
  if (!options.ok) return "failed";
  let response;
  try {
    response = await register({ optionsJSON: await options.json() });
  } catch (failure) {
    return outcomeOf(failure);
  }
  const verified = await send(`${BASE}/verify-registration`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response, name }),
  });
  return verified.ok ? "ok" : "failed";
}

/**
 * Signs in with a passkey kept on the device: no email to type. With `autofill`, the browser offers
 * the passkeys in the email field's suggestions and the promise waits until one is picked.
 */
export async function signInWithPasskey(
  { autofill = false }: { autofill?: boolean } = {},
  deps: PasskeyDeps = {},
): Promise<PasskeyOutcome> {
  const { fetch: send = fetch, startAuthentication: authenticate = startAuthentication } = deps;
  const options = await send(`${BASE}/generate-authenticate-options`);
  if (!options.ok) return "failed";
  let response;
  try {
    response = await authenticate({ optionsJSON: await options.json(), useBrowserAutofill: autofill });
  } catch (failure) {
    return outcomeOf(failure);
  }
  const verified = await send(`${BASE}/verify-authentication`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ response }),
  });
  if (verified.ok) return "ok";
  return (await codeOf(verified)) === "PASSKEY_NOT_FOUND" ? "unknown_key" : "failed";
}

/** A first name for a new passkey, from the browser: the person can rename it later. */
export function deviceName(userAgent: string, locale: Locale): string {
  const m = appMessages(locale).devices;
  if (/iPhone/.test(userAgent)) return "iPhone";
  if (/iPad/.test(userAgent)) return "iPad";
  if (/Android/.test(userAgent)) return m.android;
  if (/Macintosh|Mac OS X/.test(userAgent)) return "Mac";
  if (/Windows/.test(userAgent)) return m.windows;
  if (/CrOS/.test(userAgent)) return "Chromebook";
  if (/Linux/.test(userAgent)) return m.linux;
  return m.other;
}
