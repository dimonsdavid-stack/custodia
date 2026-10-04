#!/usr/bin/env bash
set -Eeuo pipefail
: "${IMAGE_DIGEST:?Set immutable registry image digest}"
: "${READY_URL:?Set candidate readiness HTTPS URL reachable by the runner}"
: "${PROMETHEUS_URL:?Set authenticated internal Prometheus base URL}"
: "${PROMETHEUS_TOKEN:?Set a read-only Prometheus token}"
[[ "$READY_URL" == https://* && "$PROMETHEUS_URL" == https://* ]] || { echo 'HTTPS is required' >&2; exit 1; }
root=$(cd "$(dirname "$0")/../.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
node "$root/infra/scripts/render-deployment.mjs" candidate "$IMAGE_DIGEST" "$work/candidate.json"
kubectl -n custodia get secret custodia-runtime custodia-attestation >/dev/null
kubectl apply -f "$root/infra/kubernetes/base.yaml"
kubectl apply -f "$work/candidate.json"
kubectl -n custodia rollout status deployment/custodia-candidate --timeout=300s
# Candidate ingress must exclusively select release=candidate. No customer traffic is switched yet.
for cycle in $(seq 1 12); do
  curl --fail --silent --show-error --max-time 10 "$READY_URL" >"$work/readiness.json"
  node -e 'const fs=require("fs"); const r=JSON.parse(fs.readFileSync(process.argv[1])); if(r.ok!==true) process.exit(1)' "$work/readiness.json"
  sleep 5
done
query='(sum(rate(custodia_http_requests_total{release="candidate",status=~"5.."}[1m])) or vector(0)) / sum(rate(custodia_http_requests_total{release="candidate"}[1m]))'
check_metrics() {
  curl --fail --silent --show-error --max-time 10 -H "Authorization: Bearer $PROMETHEUS_TOKEN" --get --data-urlencode "query=$query" "$PROMETHEUS_URL/api/v1/query" >"$work/metrics.json"
  node -e 'const fs=require("fs");const m=JSON.parse(fs.readFileSync(process.argv[1]));if(m.status!=="success"||!m.data.result.length) throw Error("No release metrics: promotion denied");const values=m.data.result.map(x=>Number(x.value[1]));if(values.some(x=>!Number.isFinite(x)||x>0.01)) throw Error("Error budget exceeded");' "$work/metrics.json"
}
check_metrics
previous=$(kubectl -n custodia get deployment custodia-stable -o jsonpath='{.spec.template.spec.containers[0].image}' 2>/dev/null || true)
node "$root/infra/scripts/render-deployment.mjs" stable "$IMAGE_DIGEST" "$work/stable.json"
rollback() {
  if [[ -n "$previous" ]]; then
    kubectl -n custodia set image deployment/custodia-stable "custodia=$previous"
    kubectl -n custodia rollout status deployment/custodia-stable --timeout=300s
  else
    kubectl -n custodia delete deployment custodia-stable --ignore-not-found
  fi
}
trap 'rollback; rm -rf "$work"' ERR
kubectl apply -f "$work/stable.json"
kubectl -n custodia rollout status deployment/custodia-stable --timeout=300s
query='(sum(rate(custodia_http_requests_total{release="stable",status=~"5.."}[1m])) or vector(0)) / sum(rate(custodia_http_requests_total{release="stable"}[1m]))'
for cycle in $(seq 1 12); do sleep 5; check_metrics; done
kubectl -n custodia scale deployment custodia-candidate --replicas=0
trap - ERR
printf '%s\n' 'Promotion verified. Database changes remain forward-only; image rollback does not reverse committed transactions.'
