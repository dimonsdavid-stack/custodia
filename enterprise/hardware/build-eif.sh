#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v nitro-cli >/dev/null
command -v docker >/dev/null
: "${EIF_OUTPUT:?Absolute output path required}"
[[ "$EIF_OUTPUT" = /* ]] || exit 2
docker build --pull -f Dockerfile -t custodia-nitro:release ..
nitro-cli build-enclave --docker-uri custodia-nitro:release --output-file "$EIF_OUTPUT" > "$EIF_OUTPUT.measurements.json"
python3 - "$EIF_OUTPUT.measurements.json" <<'PY'
import json,sys
m=json.load(open(sys.argv[1]))['Measurements']
for key in ('PCR0','PCR1','PCR2'):
    value=m[key]
    if len(value)!=96 or not any(c!='0' for c in value):
        raise SystemExit('Invalid production measurement')
print(json.dumps({'pcrs':{k[3:]:m[k].lower() for k in ('PCR0','PCR1','PCR2')}},indent=2))
PY
