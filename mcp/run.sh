#!/usr/bin/env bash
set -euo pipefail
: "${KIP_URL:=http://localhost:8081/execute_kip}"
: "${KIP_TOKEN:=changeme-kip-token}"
NODE_BIN="$(command -v node || true)"
if [[ -z "$NODE_BIN" ]]; then echo "node not found"; exit 127; fi
exec "$NODE_BIN" /opt/projects/kip-mcp/index.js
