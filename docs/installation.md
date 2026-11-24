# Installation

Wishalia ships as four images and one Helm chart, published for every release:

- images: `ghcr.io/arcanexus/wishalia-{api,worker,web-app,web-public}:<version>` (amd64, arm64)
- chart: `oci://ghcr.io/arcanexus/charts/wishalia`

## Prerequisites

- Kubernetes 1.29+ with an ingress controller and TLS certificates (cert-manager or a wildcard).
- A database: the chart deploys its own PostgreSQL by default, or uses yours, PostgreSQL 16+
  (see [The database](#the-database)). The data model and the job queue both live there.
- A default StorageClass for the built-in PostgreSQL's volume (`postgresql.persistence`).
- Optional, for the images of the items: a volume (a PersistentVolumeClaim, created by the chart
  or existing) or an S3 bucket (MinIO); the chart then deploys imgproxy
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

The chart holds no secret value: create `wishalia-secrets` with your secret manager. Its keys are
listed in [Configuration](configuration.md).

## The database

### Without a database: the chart deploys PostgreSQL

The default (`postgresql.enabled=true`). The chart runs the official `postgres` image (18, Alpine)
as a StatefulSet, with a 5 GiB volume (`postgresql.persistence`; or a claim you already have, `existingClaim`), as a non-root user, on a read-only
root filesystem, behind a NetworkPolicy that only lets the API and the worker in. It gives the API
and the worker their `DATABASE_URL` by itself.

- **The password**: made at the first install and kept in the Secret `<release>-wishalia-postgresql`,
  read back at each upgrade. It stays when the release is uninstalled, like the volume, so that a
  reinstall opens the same data. ArgoCD and `helm template` cannot read the cluster back: with them,
  create the Secret yourself and name it in `postgresql.auth.existingSecret` (key `password`),
  otherwise each sync would make a new password that no longer opens the database.

  ```sh
  kubectl -n wishalia create secret generic wishalia-postgresql \
    --from-literal=password="$(openssl rand -hex 24)"
  ```

- **The migrations**: the database only exists once the release is installed, so each API pod
  applies them before it starts (an init container), waiting up to five minutes for PostgreSQL. A
  lock lets one pod migrate at a time; the others then find nothing left to do.
- **Backups**: yours to plan, e.g. a CronJob running `pg_dump`, or a snapshot of the volume. A new
  major version of PostgreSQL (`postgresql.image.tag`) does not read the data of the previous one:
  dump, upgrade, restore.

### You already have PostgreSQL

Set `postgresql.enabled=false` and give its URL, `postgres://user:password@host:5432/database`
(the password URL-encoded), in one of two places:

- `externalDatabase.existingSecret`: a Secret of its own, key `DATABASE_URL` (or
  `externalDatabase.urlKey`), e.g. the one your PostgreSQL operator makes (CloudNativePG's
  `<cluster>-app` Secret holds it under the key `uri`);
- or `existingSecret`, with the other secrets, key `DATABASE_URL`.

```sh
helm install wishalia oci://ghcr.io/arcanexus/charts/wishalia \
  --namespace wishalia --create-namespace \
  --set postgresql.enabled=false \
  --set externalDatabase.existingSecret=wishalia-db \
  --set hosts.public=wishalia.example.com \
  --set hosts.app=app.wishalia.example.com \
  --set ingress.enabled=true \
  --set existingSecret=wishalia-secrets
```

The migrations then run in a Job before each install and upgrade (a Helm hook). The database
needs no extension; the user needs to create tables in it. The chart refuses to render without any
database, and with two (`postgresql.enabled` and `externalDatabase.existingSecret`).

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

With ArgoCD, set `postgresql.auth.existingSecret` for the built-in PostgreSQL (see above). With your
own database, the migration Job is a Helm hook: ArgoCD runs it as a PreSync hook, before the new pods.

Every value is described in [Chart values](chart-values.md).
