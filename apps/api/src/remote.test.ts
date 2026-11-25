import { describe, expect, it } from "vitest";

import { createPageFetcher, RemoteError } from "./remote.js";

const URL_OK = "https://www.wishlistr.com/alex/";

function reply(body: ConstructorParameters<typeof Response>[0], init: ResponseInit = {}): typeof fetch {
  return (async () =>
    new Response(body, { headers: { "content-type": "text/html; charset=utf-8" }, ...init })) as typeof fetch;
}

async function code(promise: Promise<unknown>) {
  try {
    await promise;
  } catch (error) {
    return error instanceof RemoteError ? error.code : "other";
  }
  return undefined;
}

describe("createPageFetcher", () => {
  it("reads an HTML page, without following redirects", async () => {
    let seen: RequestInit | undefined;
    const fetchPage = createPageFetcher({
      fetch: (async (_url: string, init: RequestInit) => {
        seen = init;
        return new Response("<ul id='wishlist'></ul>", { headers: { "content-type": "text/html" } });
      }) as typeof fetch,
    });
    expect(await fetchPage(URL_OK)).toBe("<ul id='wishlist'></ul>");
    expect(seen?.redirect).toBe("manual");
  });

  it("only reads the allowed site", async () => {
    expect(await code(createPageFetcher({ fetch: reply("x") })("https://evil.example/"))).toBe(
      "remote_unreachable",
    );
  });

  it("tells a missing list from a site that does not answer", async () => {
    expect(await code(createPageFetcher({ fetch: reply(null, { status: 404 }) })(URL_OK))).toBe(
      "remote_not_found",
    );
    expect(await code(createPageFetcher({ fetch: reply(null, { status: 302 }) })(URL_OK))).toBe(
      "remote_not_found",
    );
    expect(await code(createPageFetcher({ fetch: reply("x", { status: 500 }) })(URL_OK))).toBe(
      "remote_unreachable",
    );
    expect(
      await code(
        createPageFetcher({ fetch: reply("{}", { headers: { "content-type": "application/json" } }) })(
          URL_OK,
        ),
      ),
    ).toBe("remote_unreachable");
    const failing = (async () => {
      throw new TypeError("network");
    }) as typeof fetch;
    expect(await code(createPageFetcher({ fetch: failing })(URL_OK))).toBe("remote_unreachable");
  });

  it("stops reading past the size limit", async () => {
    expect(await code(createPageFetcher({ fetch: reply("x".repeat(100)), maxBytes: 10 })(URL_OK))).toBe(
      "too_large",
    );
  });

  it("gives up on a body that breaks", async () => {
    const broken = new ReadableStream({
      pull(controller) {
        controller.error(new Error("reset"));
      },
    });
    expect(await code(createPageFetcher({ fetch: reply(broken) })(URL_OK))).toBe("remote_unreachable");
  });

  it("reads an empty answer as an empty page", async () => {
    expect(await createPageFetcher({ fetch: reply(null) })(URL_OK)).toBe("");
  });
});
