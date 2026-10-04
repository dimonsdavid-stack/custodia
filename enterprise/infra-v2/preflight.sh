#!/usr/bin/env bash
set -euo pipefail
for executable in aws terraform kubectl; do
  command -v "$executable" >/dev/null || { printf '%s unavailable\n' "$executable" >&2; exit 2; }
done
: "${CUSTODIA_AWS_ACCOUNT_ID:?Explicit deployment account required}"
: "${AWS_REGION:?Region required}"
: "${CUSTODIA_CLUSTER_NAME:?Cluster required}"
: "${CUSTODIA_SECRET_ARN:?Application secret ARN required}"
actual_account=$(aws sts get-caller-identity --query Account --output text)
[[ "$actual_account" == "$CUSTODIA_AWS_ACCOUNT_ID" ]] || { echo 'AWS account mismatch' >&2; exit 3; }
aws eks describe-cluster --name "$CUSTODIA_CLUSTER_NAME" --query 'cluster.status' --output text | awk '$0 != "ACTIVE" {exit 1}'
aws secretsmanager describe-secret --secret-id "$CUSTODIA_SECRET_ARN" --query 'ARN' --output text >/dev/null
kubectl auth can-i get deployments --namespace custodia | awk '$0 != "yes" {exit 1}'
terraform -chdir="$(dirname "$0")" validate
printf 'Account, cluster, secret metadata, Kubernetes access and Terraform validation passed. No infrastructure modified.\n'
