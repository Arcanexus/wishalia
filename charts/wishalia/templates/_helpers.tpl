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
