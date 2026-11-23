import type { Handle, ServerInit } from "@sveltejs/kit/hooks";
import { metricsPort, processMetrics } from "@wishlist/metrics";

import { applySecurityHeaders } from "#lib/security-headers.ts";

const metrics = processMetrics("web-public", process.env.APP_VERSION ?? "dev");

// Runs when the server starts, never during the build
export const init: ServerInit = async () => {
  await metrics.start(metricsPort(), {
    onError: (error) => process.stderr.write(`metrics server failed to start: ${error.message}\n`),
  });
};

export const handle: Handle = async ({ event, resolve }) => {
  const started = performance.now();
  const response = await resolve(event);
  applySecurityHeaders(response.headers);
  // The route id (/[token]), never the URL: share link tokens never reach the metrics
  metrics.http.observe({
    method: event.request.method,
    route: event.route.id,
    status: response.status,
    seconds: (performance.now() - started) / 1000,
  });
  return response;
};
