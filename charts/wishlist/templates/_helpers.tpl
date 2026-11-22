{{- define "wishlist.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "wishlist.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else if contains (include "wishlist.name" .) .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name (include "wishlist.name" .) | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}

{{- define "wishlist.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" }}
app.kubernetes.io/name: {{ include "wishlist.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{- /* Selector labels of one component: pass (dict "root" $ "component" "api") */ -}}
{{- define "wishlist.selectorLabels" -}}
app.kubernetes.io/name: {{ include "wishlist.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "wishlist.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "wishlist.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{- /* Image of one component: pass (dict "root" $ "component" "api") */ -}}
{{- define "wishlist.image" -}}
{{- $img := .root.Values.image }}
{{- printf "%s/%s-%s:%s" $img.registry $img.repository .component (default .root.Chart.AppVersion $img.tag) }}
{{- end }}

{{- /* The components: values key, image and Service name suffix, and whether the ingress exposes it */ -}}
{{- define "wishlist.components" -}}
api: { values: api, exposed: false }
worker: { values: worker, exposed: false }
web-app: { values: webApp, exposed: true }
web-public: { values: webPublic, exposed: true }
{{- end }}

{{- define "wishlist.apiUrl" -}}
{{- printf "http://%s-api:%v" (include "wishlist.fullname" .) .Values.api.port }}
{{- end }}
