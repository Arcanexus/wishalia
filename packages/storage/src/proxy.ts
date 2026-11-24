import { isImagePath } from "./imgproxy.js";

/**
 * What the frontends answer under /img/ (docs/images.md): imgproxy's answer to a signed path,
 * passed on. imgproxy stays inside the cluster, so the CSP keeps img-src 'self' and the bucket is
 * never reachable from outside. The paths are content-addressed (a new file is a new key), so the
 * browsers may keep them for a year.
 */
export async function proxyImage(
  path: string,
  options: { imgproxyUrl: string | undefined; fetch?: typeof fetch; timeoutMs?: number },
): Promise<Response> {
  const notFound = () =>
    new Response("Not found", {
      status: 404,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  if (!options.imgproxyUrl || !isImagePath(path)) return notFound();
  const send = options.fetch ?? fetch;
  let answer: Response;
  try {
    answer = await send(`${options.imgproxyUrl.replace(/\/+$/, "")}${path}`, {
      headers: { accept: "image/webp" },
      redirect: "error",
      signal: AbortSignal.timeout(options.timeoutMs ?? 15_000),
    });
  } catch {
    return new Response("Unavailable", {
      status: 502,
      headers: { "content-type": "text/plain", "cache-control": "no-store" },
    });
  }
  const type = answer.headers.get("content-type") ?? "";
  if (!answer.ok || !/^image\/(webp|jpeg|png|avif|gif)$/.test(type)) {
    await answer.body?.cancel();
    return notFound();
  }
  return new Response(answer.body, {
    status: 200,
    headers: {
      "content-type": type,
      "cache-control": "public, max-age=31536000, immutable",
      "x-content-type-options": "nosniff",
      "content-security-policy": "default-src 'none'; sandbox",
      ...(answer.headers.get("content-length")
        ? { "content-length": answer.headers.get("content-length") ?? "" }
        : {}),
    },
  });
}
