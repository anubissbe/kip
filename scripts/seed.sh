#!/usr/bin/env bash
set -euo pipefail

KIP_URL="${KIP_URL:-http://localhost:8081/execute_kip}"
KIP_TOKEN="${KIP_TOKEN:-changeme-kip-token}"

curl -sS -X POST "$KIP_URL" \
  -H "Authorization: Bearer ${KIP_TOKEN}" \
  -H "Content-Type: application/json" \
  --data-binary @- <<'JSON'
{"query":"UPSERT Policy {name:'Password Rotation', value:'every 90 days'}"}
JSON
echo
