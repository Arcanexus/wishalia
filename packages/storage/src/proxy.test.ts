import { describe, expect, it } from "vitest";

import { imagePath } from "./imgproxy.js";
import { proxyImage } from "./proxy.js";

const settings = { key: "ab".repeat(32), salt: "cd".repeat(32), bucket: "wishalia" };
const path = imagePath(settings, "wishes/a/b", "small", null).slice("/img".length);

function imgproxy(response: Response | Error) {
  const asked: string[] = [];
  const fetch = (async (url: string) => {
    asked.push(url);
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof globalThis.fetch;
  return { asked, fetch };
}

describe("proxyImage", () => {
  it("passes imgproxy's image on, to be kept a year", async () => {
    const { asked, fetch } = imgproxy(
      new Response(new Uint8Array([1, 2, 3]), {
        headers: { "content-type": "image/webp", "content-length": "3" },
      }),
    );
    const answer = await proxyImage(path, { imgproxyUrl: "http://imgproxy:8080/", fetch });
    expect(asked).toEqual([`http://imgproxy:8080${path}`]);
    expect(answer.status).toBe(200);
    expect(answer.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
    expect(answer.headers.get("content-length")).toBe("3");
    expect(new Uint8Array(await answer.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it("answers 404 for a path that is not signed-looking, without asking imgproxy", async () => {
    const { asked, fetch } = imgproxy(new Response(""));
    expect(
      (await proxyImage("/insecure/plain/http://10.0.0.1/x.webp", { imgproxyUrl: "http://i", fetch })).status,
    ).toBe(404);
    expect((await proxyImage(path, { imgproxyUrl: undefined, fetch })).status).toBe(404);
    expect(asked).toEqual([]);
  });

  it("answers 404 when imgproxy refuses or gives no image, 502 when it is away", async () => {
    const refused = imgproxy(
      new Response("bad signature", { status: 403, headers: { "content-type": "text/plain" } }),
    );
    expect((await proxyImage(path, { imgproxyUrl: "http://i", fetch: refused.fetch })).status).toBe(404);
    const html = imgproxy(new Response("<html>", { headers: { "content-type": "text/html" } }));
    expect((await proxyImage(path, { imgproxyUrl: "http://i", fetch: html.fetch })).status).toBe(404);
    const away = imgproxy(new Error("ECONNREFUSED"));
    expect((await proxyImage(path, { imgproxyUrl: "http://i", fetch: away.fetch })).status).toBe(502);
  });
});
