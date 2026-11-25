# Monitoring

Every component exports Prometheus metrics: the API, the worker and the two frontends. They serve
`/metrics` on a port of their own (9464 in the chart), separate from the application port. The
Services publish that port under the name `metrics`; the ingress never does, so the metrics are
not reachable from the internet.

## Turn it on

The chart turns the metrics on by default (`metrics.enabled`). With the Prometheus Operator
(kube-prometheus-stack), let the chart create a ServiceMonitor:

```yaml
metrics:
  serviceMonitor:
    enabled: true
    # The label your Prometheus selects ServiceMonitors with
    labels:
      release: kube-prometheus-stack
```

With `networkPolicy.enabled`, the API and the worker only accept a scrape from the peers listed in
`metrics.allowFrom`: by default, every pod of the `monitoring` namespace. Change it when Prometheus
runs elsewhere. See [Chart values](chart-values.md).

Outside Kubernetes, set `METRICS_PORT` on each component (see [Configuration](configuration.md)).
It is off when unset, so that the four components can run side by side on a laptop.

## Metrics

Every series carries a `component` label: `api`, `worker`, `web-app` or `web-public`.

| Metric                                    | Type      | Labels                           | Content                                                                   |
| ----------------------------------------- | --------- | -------------------------------- | ------------------------------------------------------------------------- |
| `wishalia_build_info`                     | gauge     | `version`                        | Always 1: the version that runs.                                          |
| `wishalia_http_request_duration_seconds`  | histogram | `method`, `route`, `status_code` | Duration of the requests (API and frontends). Buckets from 5 ms to 5 s.   |
| `wishalia_process_*`, `wishalia_nodejs_*` | various   |                                  | Node.js process metrics: CPU, memory, event loop lag, garbage collection. |

`route` is the route pattern (`/manage/items/:id`, `/[token]`), never the URL: no id and no share
link token reaches the metrics, and the number of series stays bounded. A request that matches no
route is counted under `route="unmatched"`.

The worker counts its [enrichment](enrichment.md) jobs: `wishalia_enrichment_jobs_total` (counter,
label `outcome`: `done`, `unchanged`, `retry`, `failed`, `skipped`) and
`wishalia_enrichment_duration_seconds` (histogram, page fetch included, from 100 ms to 20 s). No
label names an item, a link or a site.

It also counts its sweeps of the [unused image files](images.md#unused-files):
`wishalia_image_cleanup_runs_total` (counter, label `outcome`: `ok`, `error`),
`wishalia_image_cleanup_removed_total` (files removed), `wishalia_image_cleanup_checked_files` (files
the last sweep looked at) and `wishalia_image_cleanup_last_success_timestamp_seconds`. An alert on
`time() - wishalia_image_cleanup_last_success_timestamp_seconds > 86400` tells a sweep that keeps
failing (a bucket key that may not list, for instance).

## What is never measured

No metric describes contributions: no amount, no count, no rate of funding. Whoever reads the
dashboards, often the person the gifts are for, would otherwise learn what is being given to
them. This is the [anti-spoil rule](security.md), applied to monitoring; a test fails when a metric
name mentions contributions.

## Useful queries

```promql
# p95 latency of the API, per route (the spec budget is 300 ms)
histogram_quantile(0.95, sum by (le, route) (rate(wishalia_http_request_duration_seconds_bucket{component="api"}[5m])))

# Share of server errors on the public view
sum(rate(wishalia_http_request_duration_seconds_count{component="web-public",status_code=~"5.."}[5m]))
  / sum(rate(wishalia_http_request_duration_seconds_count{component="web-public"}[5m]))

# Version running, per component
wishalia_build_info
```
