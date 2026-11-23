import { createServer, type Server } from "node:http";

/**
 * A minimal HTTP server for the Kubernetes probes: the worker has no API of its own.
 * /healthz answers 200 while the worker runs, 503 once it is stopping.
 */
export function createHealthServer(isHealthy: () => boolean): Server {
  return createServer((request, response) => {
    if (request.method !== "GET" || request.url !== "/healthz") {
      response.writeHead(404).end();
      return;
    }
    const healthy = isHealthy();
    response
      .writeHead(healthy ? 200 : 503, { "content-type": "application/json" })
      .end(JSON.stringify({ status: healthy ? "ok" : "stopping" }));
  });
}
