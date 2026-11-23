import { describe, expect, it } from "vitest";

import { createHttpMetrics, createRegistry, PREFIX, UNMATCHED_ROUTE } from "./registry.js";

describe("createRegistry", () => {
  it("labels every series with the component and exposes the version", async () => {
    const registry = createRegistry({ component: "api", version: "1.2.3", defaultMetrics: false });
    const text = await registry.metrics();
    expect(text).toContain(`${PREFIX}build_info{version="1.2.3",component="api"} 1`);
  });

  it("collects the Node.js process metrics by default, with the prefix", async () => {
    const registry = createRegistry({ component: "worker", version: "dev" });
    const text = await registry.metrics();
    expect(text).toContain(`${PREFIX}process_cpu_seconds_total`);
    expect(text).toContain(`${PREFIX}nodejs_eventloop_lag_seconds`);
  });

  it("keeps registries apart: two components in one process do not clash", () => {
    expect(() => {
      createRegistry({ component: "a", version: "dev" });
      createRegistry({ component: "b", version: "dev" });
    }).not.toThrow();
  });

  it("never names a metric after contributions (anti-spoil)", async () => {
    const registry = createRegistry({ component: "api", version: "dev" });
    createHttpMetrics(registry);
    const names = (await registry.getMetricsAsJSON()).map((metric) => metric.name);
    expect(names.filter((name) => /contribut|pledge|fund|amount/i.test(name))).toEqual([]);
  });
});

describe("createHttpMetrics", () => {
  it("records the route pattern, the method and the status code", async () => {
    const registry = createRegistry({ component: "api", version: "dev", defaultMetrics: false });
    const http = createHttpMetrics(registry);
    http.observe({ method: "GET", route: "/manage/items/:id", status: 200, seconds: 0.042 });

    const text = await registry.metrics();
    expect(text).toContain(
      `${PREFIX}http_request_duration_seconds_bucket{le="0.05",component="api",method="GET",route="/manage/items/:id",status_code="200"} 1`,
    );
    expect(text).toContain(
      `${PREFIX}http_request_duration_seconds_count{component="api",method="GET",route="/manage/items/:id",status_code="200"} 1`,
    );
  });

  it("puts every request without a route in one series", async () => {
    const registry = createRegistry({ component: "api", version: "dev", defaultMetrics: false });
    const http = createHttpMetrics(registry);
    http.observe({ method: "GET", route: undefined, status: 404, seconds: 0.001 });
    http.observe({ method: "GET", route: null, status: 404, seconds: 0.001 });

    const text = await registry.metrics();
    expect(text).toContain(
      `count{component="api",method="GET",route="${UNMATCHED_ROUTE}",status_code="404"} 2`,
    );
  });
});
