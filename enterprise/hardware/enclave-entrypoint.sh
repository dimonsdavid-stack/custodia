#!/bin/sh
set -eu
python3 /app/enclave.py &
worker_pid=$!
/usr/local/bin/custodia-nitro enclave &
attestation_pid=$!
trap 'kill "$worker_pid" "$attestation_pid" 2>/dev/null || true' EXIT INT TERM
while kill -0 "$worker_pid" 2>/dev/null && kill -0 "$attestation_pid" 2>/dev/null; do sleep 1; done
exit 70
