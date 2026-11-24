import { createHash, generateKeyPairSync, randomBytes, sign, type KeyObject } from "node:crypto";

/**
 * A software passkey for the tests: what a phone or a laptop does during the WebAuthn
 * ceremonies, with an ES256 key and the "none" attestation. Enough for the API to verify the
 * real signatures, so that the tests run the whole sign-in, not a mock of it.
 */

type Cbor = number | string | Uint8Array | Cbor[] | Map<number | string, Cbor>;

function head(major: number, length: number): Buffer {
  if (length < 24) return Buffer.from([(major << 5) | length]);
  if (length < 0x100) return Buffer.from([(major << 5) | 24, length]);
  const out = Buffer.alloc(3);
  out[0] = (major << 5) | 25;
  out.writeUInt16BE(length, 1);
  return out;
}

/** The small part of CBOR (RFC 8949) that attestation objects and COSE keys use. */
export function cbor(value: Cbor): Buffer {
  if (typeof value === "number") return value >= 0 ? head(0, value) : head(1, -1 - value);
  if (typeof value === "string") {
    const bytes = Buffer.from(value, "utf8");
    return Buffer.concat([head(3, bytes.length), bytes]);
  }
  if (value instanceof Uint8Array) return Buffer.concat([head(2, value.length), value]);
  if (Array.isArray(value)) return Buffer.concat([head(4, value.length), ...value.map(cbor)]);
  return Buffer.concat([
    head(5, value.size),
    ...[...value].flatMap(([key, item]) => [cbor(key), cbor(item)]),
  ]);
}

const b64url = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64url");
const sha256 = (data: Uint8Array | string) => createHash("sha256").update(data).digest();

/** User present, user verified: the fingerprint, face or PIN was asked. */
const UP_UV = 0x01 | 0x04;
const ATTESTED = 0x40;

export interface RegistrationOptions {
  challenge: string;
  rp: { id: string };
  user: { id: string };
}

export interface AuthenticationOptions {
  challenge: string;
  rpId: string;
}

export class SoftwareAuthenticator {
  readonly credentialId = randomBytes(16);
  private readonly key: KeyObject;
  private readonly publicKey: KeyObject;
  private counter = 0;
  private userHandle = "";

  constructor(private readonly origin: string) {
    const pair = generateKeyPairSync("ec", { namedCurve: "P-256" });
    this.key = pair.privateKey;
    this.publicKey = pair.publicKey;
  }

  private clientData(type: "webauthn.create" | "webauthn.get", challenge: string): Buffer {
    return Buffer.from(JSON.stringify({ type, challenge, origin: this.origin, crossOrigin: false }));
  }

  private authData(rpId: string, flags: number, attested?: Buffer): Buffer {
    const count = Buffer.alloc(4);
    count.writeUInt32BE(this.counter);
    return Buffer.concat([sha256(rpId), Buffer.from([flags]), count, ...(attested ? [attested] : [])]);
  }

  /** The answer to navigator.credentials.create(), as @simplewebauthn/browser sends it. */
  register(options: RegistrationOptions) {
    this.userHandle = options.user.id;
    const jwk = this.publicKey.export({ format: "jwk" });
    const coseKey = cbor(
      new Map<number, Cbor>([
        [1, 2], // EC2
        [3, -7], // ES256
        [-1, 1], // P-256
        [-2, Buffer.from(jwk.x ?? "", "base64url")],
        [-3, Buffer.from(jwk.y ?? "", "base64url")],
      ]),
    );
    const idLength = Buffer.alloc(2);
    idLength.writeUInt16BE(this.credentialId.length);
    const attested = Buffer.concat([Buffer.alloc(16), idLength, this.credentialId, coseKey]);
    const attestationObject = cbor(
      new Map<string, Cbor>([
        ["fmt", "none"],
        ["attStmt", new Map()],
        ["authData", this.authData(options.rp.id, UP_UV | ATTESTED, attested)],
      ]),
    );
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: "public-key",
      response: {
        clientDataJSON: b64url(this.clientData("webauthn.create", options.challenge)),
        attestationObject: b64url(attestationObject),
        transports: ["internal"],
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }

  /** The answer to navigator.credentials.get(): a signature over the challenge. */
  authenticate(options: AuthenticationOptions) {
    this.counter += 1;
    const authenticatorData = this.authData(options.rpId, UP_UV);
    const clientDataJSON = this.clientData("webauthn.get", options.challenge);
    const signature = sign("sha256", Buffer.concat([authenticatorData, sha256(clientDataJSON)]), this.key);
    return {
      id: b64url(this.credentialId),
      rawId: b64url(this.credentialId),
      type: "public-key",
      response: {
        clientDataJSON: b64url(clientDataJSON),
        authenticatorData: b64url(authenticatorData),
        signature: b64url(signature),
        userHandle: this.userHandle,
      },
      clientExtensionResults: {},
      authenticatorAttachment: "platform",
    };
  }
}
