{{- define "wishalia.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "wishalia.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else if contains (include "wishalia.name" .) .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "wishalia.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "wishalia.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "wishalia.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- /* Selector labels of one component: pass (dict "root" $ "component" "api") */ -}}
{{- define "wishalia.selectorLabels" -}}
app.kubernetes.io/name: {{ include "wishalia.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "wishalia.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "wishalia.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- /* Image of one component: pass (dict "root" $ "component" "api") */ -}}
{{- define "wishalia.image" -}}
{{- $img := .root.Values.image }}
{{- printf "%s/%s-%s:%s" $img.registry $img.repository .component (default .root.Chart.AppVersion $img.tag) }}
{{- end }}

{{- /* The components: values key, image and Service name suffix, and whether the ingress exposes it */ -}}
{{- define "wishalia.components" -}}
api: { values: api, exposed: false }
worker: { values: worker, exposed: false }
web-app: { values: webApp, exposed: true }
web-public: { values: webPublic, exposed: true }
{{- end }}

{{- define "wishalia.apiUrl" -}}
{{- printf "http://%s-api:%v" (include "wishalia.fullname" .) .Values.api.port }}
{{- end }}

{{- /* NetworkPolicy ingress rule that lets Prometheus scrape the metrics port (empty when off) */ -}}
{{- define "wishalia.metricsIngressRule" -}}
{{- if and .Values.metrics.enabled .Values.metrics.allowFrom }}
- from:
    {{- toYaml .Values.metrics.allowFrom | nindent 4 }}
  ports:
    - port: metrics
{{- end }}
{{- end }}

{{- /* COOKIE_DOMAIN: auth.cookieDomain, "-" for none, or hosts.public when hosts.app is under it */ -}}
{{- define "wishalia.cookieDomain" -}}
{{- $domain := .Values.auth.cookieDomain }}
{{- if eq $domain "-" }}
{{- else if $domain }}
{{- $bare := trimPrefix "." $domain }}
{{- range list .Values.hosts.app .Values.hosts.public }}
{{- if not (or (eq . $bare) (hasSuffix (printf ".%s" $bare) .)) }}
{{- fail "auth.cookieDomain must contain hosts.app and hosts.public" }}
{{- end }}
{{- end }}
{{- $domain }}
{{- else if hasSuffix (printf ".%s" .Values.hosts.public) .Values.hosts.app }}
{{- .Values.hosts.public }}
{{- end }}
{{- end }}

{{- /* The built-in PostgreSQL (postgresql.enabled): its name, and the Secret of its password */ -}}
{{- define "wishalia.postgresql.fullname" -}}
{{- printf "%s-postgresql" (include "wishalia.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "wishalia.postgresql.secretName" -}}
{{- default (include "wishalia.postgresql.fullname" .) .Values.postgresql.auth.existingSecret }}
{{- end }}

{{- /*
Where the database comes from, checked once: the built-in PostgreSQL, or an existing one whose
DATABASE_URL is in externalDatabase.existingSecret or in existingSecret. Returns nothing.
*/ -}}
{{- define "wishalia.database.check" -}}
{{- if .Values.postgresql.enabled }}
{{- if .Values.externalDatabase.existingSecret }}
{{- fail "postgresql.enabled and externalDatabase.existingSecret: choose one database (set postgresql.enabled=false to use yours)" }}
{{- end }}
{{- range list .Values.postgresql.auth.username .Values.postgresql.auth.database }}
{{- if not (regexMatch "^[a-z_][a-z0-9_]{0,62}$" .) }}
{{- fail "postgresql.auth.username and postgresql.auth.database: lowercase letters, digits and _ only" }}
{{- end }}
{{- end }}
{{- end }}
{{- end }}

{{- /* Whether the components are told where the database is (an empty string means no) */ -}}
{{- define "wishalia.database.configured" -}}
{{- if or .Values.postgresql.enabled .Values.externalDatabase.existingSecret .Values.existingSecret }}true{{ end }}
{{- end }}

{{- /*
The env entries giving DATABASE_URL to the API, the worker and the migrations. The built-in
PostgreSQL: a URL without the password, which comes as PGPASSWORD (read by the driver), so that no
password ever needs URL-encoding. An existing database: its URL from externalDatabase.existingSecret,
or nothing here when it is in existingSecret (loaded whole by envFrom).
*/ -}}
{{- define "wishalia.database.env" -}}
{{- if .Values.postgresql.enabled }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "wishalia.postgresql.secretName" . }}
      key: {{ .Values.postgresql.auth.passwordKey }}
- name: DATABASE_URL
  value: {{ printf "postgres://%s@%s:5432/%s" .Values.postgresql.auth.username (include "wishalia.postgresql.fullname" .) .Values.postgresql.auth.database | quote }}
{{- else if .Values.externalDatabase.existingSecret }}
- name: DATABASE_URL
  valueFrom:
    secretKeyRef:
      name: {{ .Values.externalDatabase.existingSecret }}
      key: {{ .Values.externalDatabase.urlKey }}
{{- end }}
{{- end }}

{{- /* The image storage, checked: "volume" or "s3" (docs/images.md) */ -}}
{{- define "wishalia.imageStorage" -}}
{{- $storage := .Values.images.storage | default "volume" -}}
{{- if not (has $storage (list "volume" "s3")) -}}
{{- fail (printf "images.storage must be \"volume\" or \"s3\", not %q" $storage) -}}
{{- end -}}
{{- $storage -}}
{{- end }}

{{- /* Whether the images live on a volume that the API, the worker and imgproxy mount */ -}}
{{- define "wishalia.imageVolume" -}}
{{- if and .Values.images.enabled (eq (include "wishalia.imageStorage" .) "volume") }}true{{ end -}}
{{- end }}

{{- /* Where the volume is mounted, the same path in the three pods */ -}}
{{- define "wishalia.imageDir" -}}/data/images{{- end }}

{{- define "wishalia.imageClaim" -}}
{{- .Values.images.persistence.existingClaim | default (printf "%s-images" (include "wishalia.fullname" .)) -}}
{{- end }}

{{- /*
The pods that mount a ReadWriteOnce volume (the API, the worker, imgproxy) must share a node: a
podAffinity to the API pods (the first one may go anywhere), unless the values give their own
affinity. Takes (dict "root" $ "component" "worker").
*/ -}}
{{- define "wishalia.affinity" -}}
{{- $root := .root -}}
{{- if $root.Values.affinity -}}
{{- toYaml $root.Values.affinity -}}
{{- else if and (include "wishalia.imageVolume" $root) (has "ReadWriteOnce" $root.Values.images.persistence.accessModes) (has .component (list "api" "worker" "imgproxy")) -}}
podAffinity:
  requiredDuringSchedulingIgnoredDuringExecution:
    - topologyKey: kubernetes.io/hostname
      labelSelector:
        matchLabels:
          {{- include "wishalia.selectorLabels" (dict "root" $root "component" "api") | nindent 10 }}
{{- end -}}
{{- end }}

{{- /* Garage, the bucket deployed with the chart (images.garage.enabled) */ -}}
{{- define "wishalia.garage.fullname" -}}
{{- printf "%s-garage" (include "wishalia.fullname" .) | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- /* The S3 endpoint of the images: Garage's Service when the chart deploys it, else yours */ -}}
{{- define "wishalia.s3Endpoint" -}}
{{- if .Values.images.garage.enabled }}
{{- printf "http://%s:3900" (include "wishalia.garage.fullname" .) }}
{{- else }}
{{- required "images.s3.endpoint is required with images.storage=s3 (or set images.garage.enabled=true)" .Values.images.s3.endpoint }}
{{- end }}
{{- end }}

{{- /*
volumePermissions.enabled: an init container that gives a volume's root folder to the user of its
pod, for the volume drivers that do not apply fsGroup (NFS through csi-driver-nfs without
fsGroupPolicy, hostPath...). It runs as root with only the CHOWN capability, changes nothing when
the owner is already right, and never walks the files below. Takes (dict "root" $ "volume" "data"
"path" "/var/lib/postgresql" "user" 70 "group" 70).
*/ -}}
{{- define "wishalia.volumePermissions" -}}
{{- $vp := .root.Values.volumePermissions -}}
{{- $owner := printf "%v:%v" (int .user) (int .group) -}}
- name: volume-permissions
  image: {{ printf "%s/%s:%s" $vp.image.registry $vp.image.repository $vp.image.tag | quote }}
  imagePullPolicy: {{ $vp.image.pullPolicy }}
  command:
    - sh
    - -c
    - {{ printf "[ \"$(stat -c %%u:%%g %s)\" = %s ] || chown %s %s" .path $owner $owner .path | quote }}
  securityContext:
    runAsUser: 0
    runAsGroup: 0
    runAsNonRoot: false
    allowPrivilegeEscalation: false
    readOnlyRootFilesystem: true
    capabilities:
      drop: ["ALL"]
      add: ["CHOWN"]
  resources:
    {{- toYaml $vp.resources | nindent 4 }}
  volumeMounts:
    - name: {{ .volume }}
      mountPath: {{ .path }}
{{- end }}
