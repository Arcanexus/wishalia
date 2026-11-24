import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkUrl, fetchPage, isPublicAddress, safeLookup } from "./fetch.js";

describe("isPublicAddress", () => {
  it("refuses loopback, private, link-local, reserved and mapped private addresses", () => {
    for (const address of [
      "127.0.0.1",
      "10.1.2.3",
      "172.16.0.1",
      "192.168.1.10",
      "169.254.169.254",
      "100.64.0.1",
      "0.0.0.0",
      "::1",
      "::",
      "fd00::1",
      "fe80::1",
      "::ffff:10.0.0.1",
      "::ffff:7f00:1",
      "not an ip",
    ]) {
      expect(isPublicAddress(address), address).toBe(false);
    }
    for (const address of [
      "93.184.215.14",
      "2606:2800:21f:cb07:6820:80da:af6b:8b2c",
      "::ffff:93.184.215.14",
    ]) {
      expect(isPublicAddress(address), address).toBe(true);
    }
  });
});

describe("checkUrl", () => {
  it("takes http(s) on the standard ports only, without credentials or local names", () => {
    expect(checkUrl("https://www.example.com/a").hostname).toBe("www.example.com");
    for (const [url, code] of [
      ["ftp://example.com/", "invalid_url"],
      ["nonsense", "invalid_url"],
      ["https://user:pass@example.com/", "invalid_url"],
      ["https://example.com:8443/", "blocked_port"],
      ["http://127.0.0.1/", "blocked_address"],
      ["http://[::1]/", "blocked_address"],
      ["http://localhost/", "blocked_address"],
      ["http://nas.local/", "blocked_address"],
      ["http://api.internal/", "blocked_address"],
    ] as const) {
      expect(() => checkUrl(url), url).toThrow(code);
    }
  });
});

describe("safeLookup", () => {
  it("refuses a name that resolves to a private address", async () => {
    const code = await new Promise((resolve) =>
      safeLookup("localhost", {}, (error) => resolve((error as { code?: string } | null)?.code)),
    );
    expect(code).toBe("blocked_address");
  });
});

describe("fetchPage", () => {
  let server: Server;
  let port = 0;
  // The test server is on 127.0.0.1: its name resolves there only for these tests
  const lookup = ((_host: string, options: { all?: boolean }, callback: (...args: unknown[]) => void) =>
    options.all
      ? callback(null, [{ address: "127.0.0.1", family: 4 }])
      : callback(null, "127.0.0.1", 4)) as never;

  beforeAll(async () => {
    server = createServer((request, response) => {
      switch (request.url) {
        case "/page":
          response.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end("<title>Été</title>");
          return;
        case "/latin":
          response
            .writeHead(200, { "content-type": "text/html; charset=iso-8859-1" })
            .end(Buffer.from([0x3c, 0x62, 0x3e, 0xe9, 0x3c, 0x2f, 0x62, 0x3e]));
          return;
        case "/gzip":
          response
            .writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" })
            .end(gzipSync("<title>zip</title>"));
          return;
        case "/moved":
          response.writeHead(301, { location: "/page" }).end();
          return;
        case "/loop":
          response.writeHead(302, { location: "/loop" }).end();
          return;
        case "/inside":
          response.writeHead(302, { location: "http://10.0.0.5/admin" }).end();
          return;
        case "/json":
          response.writeHead(200, { "content-type": "application/json" }).end("{}");
          return;
        case "/big":
          response.writeHead(200, { "content-type": "text/html" }).end("x".repeat(5000));
          return;
        case "/slow":
          setTimeout(() => response.writeHead(200, { "content-type": "text/html" }).end("late"), 500);
          return;
        default:
          response.writeHead(404).end();
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // The test server listens on a random port: let it through, everything else stays checked
  const at = (path: string) => `http://shop.test${path}`;
  const get = (path: string, more = {}) => fetchPage(at(path), { lookup, port, ...more });

  it("reads a page, its charset and its compression, and follows redirects", async () => {
    expect((await get("/page")).html).toBe("<title>Été</title>");
    expect((await get("/latin")).html).toBe("<b>é</b>");
    expect((await get("/gzip")).html).toBe("<title>zip</title>");
    expect(await get("/moved")).toEqual({ url: at("/page"), html: "<title>Été</title>" });
  });

  it("refuses what is not HTML, too big, too slow, missing, or redirected inside", async () => {
    await expect(get("/json")).rejects.toThrow("not_html");
    await expect(get("/big", { maxBytes: 1000 })).rejects.toThrow("too_large");
    await expect(get("/slow", { timeoutMs: 100 })).rejects.toThrow("timeout");
    await expect(get("/missing")).rejects.toThrow("http_404");
    await expect(get("/loop", { maxRedirects: 2 })).rejects.toThrow("too_many_redirects");
    await expect(get("/inside")).rejects.toThrow("blocked_address");
  });
});
