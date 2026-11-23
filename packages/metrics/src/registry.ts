import { collectDefaultMetrics, Gauge, Histogram, Registry } from "prom-client";

/** Prefix of every metric: the code name, which stays when the product gets its brand. */
export const PREFIX = "wishlist_";

export interface RegistryOptions {
  /** api, worker, web-app or web-public: the `component` label of every series. */
  component: string;
  /** APP_VERSION, exposed by wishlist_build_info. */
  version: string;
  /** Collect the Node.js process metrics (CPU, memory, event loop, GC). True by default. */
  defaultMetrics?: boolean;
}

/**
 * A registry per process, never prom-client's global one: tests and the dev server can create
 * several without "metric already registered" errors.
 *
 * Anti-spoil: no metric may describe contributions (amounts, counts, rates). Whoever reads Grafana
 * could otherwise see what is being given to them. Request metrics carry the route pattern only,
 * never an id or a token from the URL.
 */
export function createRegistry({ component, version, defaultMetrics = true }: RegistryOptions): Registry {
  const registry = new Registry();
  registry.setDefaultLabels({ component });
  if (defaultMetrics) collectDefaultMetrics({ register: registry, prefix: PREFIX });

  new Gauge({
    name: `${PREFIX}build_info`,
    help: "Always 1: the version of the running component, as a label.",
    labelNames: ["version"],
    registers: [registry],
  }).set({ version }, 1);

  return registry;
}

/** Upper bounds of the request duration buckets, in seconds: the p95 budget of the spec is 300 ms. */
export const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.2, 0.3, 0.5, 1, 2.5, 5];

/** The route label of a request that matched no route: one series, whatever the URL was. */
export const UNMATCHED_ROUTE = "unmatched";

export interface HttpMetrics {
  /**
   * Records one request. `route` is the route pattern (`/manage/items/:id`), never the URL, so that
   * the number of series stays bounded and no id leaks into the metrics.
   */
  observe(request: {
    method: string;
    route: string | null | undefined;
    status: number;
    seconds: number;
  }): void;
}

export function createHttpMetrics(registry: Registry): HttpMetrics {
  const duration = new Histogram({
    name: `${PREFIX}http_request_duration_seconds`,
    help: "Duration of the HTTP requests, by method, route pattern and status code.",
    labelNames: ["method", "route", "status_code"],
    buckets: DURATION_BUCKETS,
    registers: [registry],
  });

  return {
    observe({ method, route, status, seconds }) {
      duration.observe({ method, route: route ?? UNMATCHED_ROUTE, status_code: String(status) }, seconds);
    },
  };
}
