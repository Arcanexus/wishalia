# Installation

Wishalia ships as four images and one Helm chart, published for every release:

- images: `ghcr.io/arcanexus/wishalia-{api,worker,web-app,web-public}:<version>` (amd64, arm64)
- chart: `oci://ghcr.io/arcanexus/charts/wishalia`

## Prerequisites

- Kubernetes 1.29+ with an ingress controller and TLS certificates (cert-manager or a wildcard).
- PostgreSQL 16+ (the data model and the job queue both live there).
- Optional: an S3 bucket (MinIO) for the images of the items; the chart then deploys imgproxy
  (`images.enabled`, see [Images](images.md)).
- Two DNS names: the public view (`wishalia.example.com`) and the management app
  (`app.wishalia.example.com`). They must differ: the chart refuses to render otherwise.

## Install with Helm

```sh
helm install wishalia oci://ghcr.io/arcanexus/charts/wishalia \
  --namespace wishalia --create-namespace \
  --set hosts.public=wishalia.example.com \
  --set hosts.app=app.wishalia.example.com \
  --set ingress.enabled=true \
  --set existingSecret=wishalia-secrets
```

The chart holds no secret value: create `wishalia-secrets` with your secret manager, with at least
`DATABASE_URL`. Its keys are listed in [Configuration](configuration.md).

## With ArgoCD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: wishalia
  namespace: argocd
spec:
  project: default
  source:
    repoURL: ghcr.io/arcanexus/charts
    chart: wishalia
    targetRevision: 0.1.0
    helm:
      valuesObject:
        hosts:
          public: wishalia.example.com
          app: app.wishalia.example.com
        ingress:
          enabled: true
        existingSecret: wishalia-secrets
  destination:
    server: https://kubernetes.default.svc
    namespace: wishalia
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true]
```

The migration Job is a Helm hook: ArgoCD runs it as a PreSync hook, before the new pods.

Every value is described in [Chart values](chart-values.md).
