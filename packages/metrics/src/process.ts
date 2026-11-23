import type { Server } from "node:http";

import type { Registry } from "prom-client";

import { createHttpMetrics, createRegistry, type HttpMetrics } from "./registry.js";
import { startMetricsServer } from "./server.js";

export interface ProcessMetrics {
  registry: Registry;
  http: HttpMetrics;
  /** Starts the /metrics server once, whatever the number of calls. */
  start(port: number, options?: Parameters<typeof startMetricsServer>[2]): Promise<Server | null>;
}

const KEY = Symbol.for("wishalia.metrics");
type Store = Map<string, ProcessMetrics>;

/**
 * The metrics of one component, created once per process. The SvelteKit dev server reloads the
 * hooks on every change: without this, each reload would register the metrics and open the port
 * again.
 */
export function processMetrics(component: string, version: string): ProcessMetrics {
  const holder = globalThis as typeof globalThis & { [KEY]?: Store };
  const store = (holder[KEY] ??= new Map());
  const existing = store.get(component);
  if (existing) return existing;

  const registry = createRegistry({ component, version });
  let started: Promise<Server | null> | undefined;
  const metrics: ProcessMetrics = {
    registry,
    http: createHttpMetrics(registry),
    start: (port, options) => (started ??= startMetricsServer(registry, port, options)),
  };
  store.set(component, metrics);
  return metrics;
}
