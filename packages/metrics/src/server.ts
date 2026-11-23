import { createServer, type Server } from "node:http";

import type { Registry } from "prom-client";

/**
 * The /metrics endpoint, on its own port: the Services publish it for Prometheus, the Ingress never
 * does, so the metrics are not reachable from the internet. GET and HEAD only, nothing else.
 */
export function createMetricsServer(registry: Registry): Server {
  return createServer((request, response) => {
    const path = request.url?.split("?")[0];
    if (path !== "/metrics") {
      response.writeHead(404).end();
      return;
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" }).end();
      return;
    }
    registry.metrics().then(
      (body) => {
        response.writeHead(200, { "content-type": registry.contentType, "cache-control": "no-store" });
        response.end(request.method === "HEAD" ? undefined : body);
      },
      () => response.writeHead(500).end(),
    );
  });
}

/**
 * Reads METRICS_PORT. Unset, empty or 0: the metrics are off (the default on a laptop, where the
 * four components would fight for one port). The Helm chart sets it.
 */
export function metricsPort(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.METRICS_PORT?.trim();
  if (!raw) return 0;
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(
      `Invalid configuration:\n- METRICS_PORT: expected a port between 0 and 65535, got "${raw}"`,
    );
  }
  return port;
}

/**
 * Starts the metrics server when a port is given, and resolves once it listens. A metrics server
 * that cannot start must not stop the application: the error goes to `onError` and the result is null.
 */
export async function startMetricsServer(
  registry: Registry,
  port: number,
  { host = "0.0.0.0", onError = () => {} }: { host?: string; onError?: (error: Error) => void } = {},
): Promise<Server | null> {
  if (port === 0) return null;
  const server = createMetricsServer(registry);
  return new Promise((resolve) => {
    server.once("error", (error) => {
      onError(error);
      resolve(null);
    });
    server.listen(port, host, () => resolve(server));
  });
}
