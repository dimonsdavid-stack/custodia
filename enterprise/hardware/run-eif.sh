#!/usr/bin/env bash
set -euo pipefail
: "${EIF_OUTPUT:?EIF path required}"
: "${ENCLAVE_CID:?Production CID required}"
[[ "$ENCLAVE_CID" =~ ^[0-9]+$ ]] && (( ENCLAVE_CID >= 4 )) || exit 2
# Never pass --debug-mode: debug PCRs are rejected by the gateway.
exec nitro-cli run-enclave --eif-path "$EIF_OUTPUT" --cpu-count 2 --memory 1536 --enclave-cid "$ENCLAVE_CID"
