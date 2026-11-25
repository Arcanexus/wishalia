import { MAX_IMPORT_BYTES } from "@wishalia/domain";

/**
 * Reading the public page of a list on another service, for an import (docs/import.md). Only
 * addresses built by @wishalia/domain reach it (wishlistrAddress: https://www.wishlistr.com/<user>/),
 * and it checks that again: the API never fetches an address a person typed. No redirect is
 * followed, the time and the size are bounded, and only HTML is read.
 */

export type FetchPage = (url: string) => Promise<string>;

export class RemoteError extends Error {
  constructor(readonly code: "remote_not_found" | "remote_unreachable" | "too_large") {
    super(code);
  }
}

const ALLOWED_PREFIXES = ["https://www.wishlistr.com/"];
const USER_AGENT = "Mozilla/5.0 (compatible; Wishalia/1.0; self-hosted wishlist; list import)";

export interface RemoteOptions {
  fetch?: typeof fetch;
  timeoutMs?: number;
  maxBytes?: number;
}

export function createPageFetcher({
  fetch: send = fetch,
  timeoutMs = 10_000,
  maxBytes = 3 * MAX_IMPORT_BYTES,
}: RemoteOptions = {}): FetchPage {
  return async (url) => {
    if (!ALLOWED_PREFIXES.some((prefix) => url.startsWith(prefix)))
      throw new RemoteError("remote_unreachable");
    let response: Response;
    try {
      response = await send(url, {
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { "user-agent": USER_AGENT, accept: "text/html", "accept-language": "fr,en;q=0.8" },
      });
    } catch {
      throw new RemoteError("remote_unreachable");
    }
    // A list that does not exist (or is private) is answered by a redirect or a 404
    if (response.status === 404 || (response.status >= 300 && response.status < 400)) {
      await response.body?.cancel();
      throw new RemoteError("remote_not_found");
    }
    if (
      !response.ok ||
      !/text\/html|application\/xhtml\+xml/i.test(response.headers.get("content-type") ?? "")
    ) {
      await response.body?.cancel();
      throw new RemoteError("remote_unreachable");
    }
    const reader = response.body?.getReader();
    if (!reader) return "";
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.length;
        if (size > maxBytes) {
          await reader.cancel();
          throw new RemoteError("too_large");
        }
        chunks.push(value);
      }
    } catch (error) {
      if (error instanceof RemoteError) throw error;
      throw new RemoteError("remote_unreachable");
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder("utf-8").decode(bytes);
  };
}
