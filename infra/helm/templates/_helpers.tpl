{{/*
Expand the name of the chart.
*/}}
{{- define "comms.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "comms.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart label.
*/}}
{{- define "comms.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels for a service.
Usage: {{ include "comms.serviceLabels" (dict "serviceName" "auth" "context" .) }}
*/}}
{{- define "comms.serviceLabels" -}}
helm.sh/chart: {{ include "comms.chart" .context }}
app.kubernetes.io/name: {{ .serviceName }}-service
app.kubernetes.io/instance: {{ .context.Release.Name }}
app.kubernetes.io/version: {{ .context.Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .context.Release.Service }}
app.kubernetes.io/part-of: comms-platform
{{- end }}

{{/*
Selector labels for a service.
*/}}
{{- define "comms.serviceSelectorLabels" -}}
app.kubernetes.io/name: {{ .serviceName }}-service
app.kubernetes.io/instance: {{ .context.Release.Name }}
{{- end }}

{{/*
Image for a service.
Usage: {{ include "comms.serviceImage" (dict "serviceValues" .Values.services.auth "context" .) }}
*/}}
{{- define "comms.serviceImage" -}}
{{- $registry := .context.Values.global.imageRegistry -}}
{{- $tag := .serviceValues.image.tag | default .context.Values.global.imageTag -}}
{{- if $registry -}}
{{- printf "%s/%s:%s" $registry .serviceValues.image.repository $tag -}}
{{- else -}}
{{- printf "%s:%s" .serviceValues.image.repository $tag -}}
{{- end }}
{{- end }}
