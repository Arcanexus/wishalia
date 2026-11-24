import { proxyImage } from "@wishalia/storage";

import type { RequestHandler } from "./$types";

/**
 * The thumbnails of the items (docs/images.md): imgproxy's answer to a path the API signed. Same
 * origin, so the CSP keeps img-src 'self'; imgproxy and the bucket stay inside the cluster.
 */
export const GET: RequestHandler = ({ params }) =>
  proxyImage(`/${params.path}`, { imgproxyUrl: process.env.IMGPROXY_URL });
