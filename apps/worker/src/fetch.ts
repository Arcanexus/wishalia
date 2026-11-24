import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { BlockList, isIP } from "node:net";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";
import type { Readable } from "node:stream";

import { MAX_IMAGE_BYTES } from "@wishalia/domain";

/**
 * Fetching the page of an item's link, safely (docs/enrichment.md). The link comes from the owner,
 * so the worker must not become a way into the cluster or the home network (SSRF): only http(s)
 * on the standard ports, only public addresses (checked on the address actually connected to,
 * also after each redirect), a time limit, a size limit, and HTML only.
 */

export class FetchError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

const blocked = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 127],
  ["64:ff9b::", 96],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

/** Whether an address is on the public Internet: never loopback, private, link-local or reserved. */
export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, "ipv4");
  if (family !== 6) return false;
  // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is checked as IPv4
  const mapped = address.toLowerCase().match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped?.[1]) return isPublicAddress(mapped[1]);
  if (/^::ffff:/i.test(address)) return false;
  return !blocked.check(address, "ipv6");
}

type LookupCallback = (
  error: NodeJS.ErrnoException | null,
  address: string | LookupAddress[],
  family?: number,
) => void;

/** dns.lookup that refuses names pointing at a non-public address (checked at connection time). */
export function safeLookup(hostname: string, options: { all?: boolean }, callback: LookupCallback): void {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    if (addresses.length === 0 || !addresses.every((entry) => isPublicAddress(entry.address))) {
      return callback(Object.assign(new FetchError("blocked_address"), { code: "blocked_address" }), []);
    }
    const [firstAddress] = addresses;
    if (options.all) return callback(null, addresses);
    return callback(null, firstAddress?.address ?? "", firstAddress?.family);
  });
}

export interface FetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  /** For the tests: the DNS lookup (the safe one by default). */
  lookup?: typeof safeLookup;
  /** For the tests: the port to connect to, whatever the link says. */
  port?: number;
}

export interface Page {
  /** Where the page was found, after the redirects. */
  url: string;
  html: string;
}

/** A file of a page, as it came: an image, read again from its bytes before it is kept. */
export interface Download {
  url: string;
  bytes: Buffer;
  contentType: string;
}

/** What one request accepts: HTML for a page, an image for its pictures. */
interface Wanted {
  accept: string;
  type: RegExp;
}
const HTML: Wanted = {
  accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.1",
  type: /text\/html|application\/xhtml\+xml/i,
};
const IMAGE: Wanted = {
  accept: "image/avif,image/webp,image/png,image/jpeg,image/*;q=0.8",
  // Some shops serve their images as application/octet-stream; the bytes decide after
  type: /^\s*(image\/(jpeg|png|webp|gif|avif|heic)|application\/octet-stream)\b/i,
};

const USER_AGENT = "Mozilla/5.0 (compatible; Wishalia/1.0; self-hosted wishlist)";

/** Checks a link before connecting: http(s), standard port, no credentials, no private literal. */
export function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new FetchError("invalid_url");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new FetchError("invalid_url");
  if (url.port && url.port !== "80" && url.port !== "443") throw new FetchError("blocked_port");
  if (url.username || url.password) throw new FetchError("invalid_url");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host) && !isPublicAddress(host)) throw new FetchError("blocked_address");
  if (/^(localhost|.*\.localhost|.*\.local|.*\.internal)$/i.test(host))
    throw new FetchError("blocked_address");
  return url;
}

function decode(stream: Readable, encoding: string | undefined): Readable {
  switch (encoding?.trim().toLowerCase()) {
    case "gzip":
    case "x-gzip":
      return stream.pipe(createGunzip());
    case "deflate":
      return stream.pipe(createInflate());
    case "br":
      return stream.pipe(createBrotliDecompress());
    default:
      return stream;
  }
}

function charsetOf(contentType: string): string {
  const charset = contentType.match(/charset=["']?([\w-]+)/i)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return "utf-8";
  }
}

/** One request, without following redirects. */
function request(
  url: URL,
  options: Required<Omit<FetchOptions, "port">> & { port: number | undefined },
  wanted: Wanted,
): Promise<{ location?: string; file?: Download }> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = client.get(
      url,
      {
        lookup: options.lookup as never,
        ...(options.port ? { port: options.port } : {}),
        timeout: options.timeoutMs,
        headers: {
          "user-agent": USER_AGENT,
          accept: wanted.accept,
          "accept-language": "fr-FR,fr;q=0.9,en;q=0.5",
          "accept-encoding": "gzip, deflate, br",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          resolve({ location: response.headers.location });
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          reject(new FetchError(`http_${status}`));
          return;
        }
        const type = response.headers["content-type"] ?? "";
        if (!wanted.type.test(type)) {
          response.resume();
          reject(new FetchError(wanted === HTML ? "not_html" : "not_image"));
          return;
        }
        const body = decode(response, response.headers["content-encoding"]);
        const chunks: Buffer[] = [];
        let size = 0;
        body.on("data", (chunk: Buffer) => {
          size += chunk.length;
          if (size > options.maxBytes) {
            req.destroy(new FetchError("too_large"));
            body.destroy();
            reject(new FetchError("too_large"));
            return;
          }
          chunks.push(chunk);
        });
        body.on("error", () => reject(new FetchError("bad_body")));
        body.on("end", () => {
          resolve({ file: { url: url.href, bytes: Buffer.concat(chunks), contentType: type } });
        });
      },
    );
    req.on("timeout", () => req.destroy(new FetchError("timeout")));
    req.on("error", (error) =>
      reject(error instanceof FetchError ? error : new FetchError(errorCode(error))),
    );
  });
}

const errorCode = (error: NodeJS.ErrnoException) =>
  error.code === "blocked_address" ? "blocked_address" : "unreachable";

/** Fetches a file, following up to a few redirects, each one checked again. */
async function fetchFile(
  raw: string,
  options: FetchOptions,
  wanted: Wanted,
  maxBytes: number,
): Promise<Download> {
  const settings = {
    timeoutMs: options.timeoutMs ?? 10_000,
    maxBytes: options.maxBytes ?? maxBytes,
    maxRedirects: options.maxRedirects ?? 5,
    lookup: options.lookup ?? safeLookup,
    port: options.port,
  };
  let url = checkUrl(raw);
  for (let hop = 0; hop <= settings.maxRedirects; hop += 1) {
    const { location, file } = await request(url, settings, wanted);
    if (file) return file;
    url = checkUrl(new URL(location ?? "", url).href);
  }
  throw new FetchError("too_many_redirects");
}

/** Fetches a page (HTML only, 3 MB at most). */
export async function fetchPage(raw: string, options: FetchOptions = {}): Promise<Page> {
  const file = await fetchFile(raw, options, HTML, 3_000_000);
  return { url: file.url, html: new TextDecoder(charsetOf(file.contentType)).decode(file.bytes) };
}

/** Fetches an image of a page (MAX_IMAGE_BYTES at most), with the same guard as the page. */
export function fetchImage(raw: string, options: FetchOptions = {}): Promise<Download> {
  return fetchFile(raw, options, IMAGE, MAX_IMAGE_BYTES);
}
