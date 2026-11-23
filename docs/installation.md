# Installation

Wishalia ships as four images and one Helm chart, published for every release:

- images: `ghcr.io/arcanexus/wishlist-{api,worker,web-app,web-public}:<version>` (amd64, arm64)
- chart: `oci://ghcr.io/arcanexus/charts/wishlist`

## Prerequisites

- Kubernetes 1.29+ with an ingress controller and TLS certificates (cert-manager or a wildcard).
- PostgreSQL 16+ (the data model and the job queue both live there).
- An S3 bucket (MinIO) for the images, from the media step on.
- Two DNS names: the public view (`wishlist.example.com`) and the management app
  (`app.wishlist.example.com`). They must differ: the chart refuses to render otherwise.

## Install with Helm

```sh
helm install wishlist oci://ghcr.io/arcanexus/charts/wishlist \
  --namespace wishlist --create-namespace \
  --set hosts.public=wishlist.example.com \
  --set hosts.app=app.wishlist.example.com \
  --set ingress.enabled=true \
  --set existingSecret=wishlist-secrets
```

The chart holds no secret value: create `wishlist-secrets` with your secret manager, with at least
`DATABASE_URL`. Its keys are listed in [Configuration](configuration.md).

## With ArgoCD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: wishlist
  namespace: argocd
spec:
  project: default
  source:
    repoURL: ghcr.io/arcanexus/charts
    chart: wishlist
    targetRevision: 0.1.0
    helm:
      valuesObject:
        hosts:
          public: wishlist.example.com
          app: app.wishlist.example.com
        ingress:
          enabled: true
        existingSecret: wishlist-secrets
  destination:
    server: https://kubernetes.default.svc
    namespace: wishlist
  syncPolicy:
    automated: { prune: true, selfHeal: true }
    syncOptions: [CreateNamespace=true]
```

The migration Job is a Helm hook: ArgoCD runs it as a PreSync hook, before the new pods.

Every value is described in [Chart values](chart-values.md).
