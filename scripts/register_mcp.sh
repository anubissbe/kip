#!/usr/bin/env bash
set -euo pipefail
: "${KIP_URL:=http://localhost:8081/execute_kip}"
: "${KIP_TOKEN:=changeme-kip-token}"
MCP="/opt/projects/kip-mcp"

mkdir -p "$MCP"
# copy files if running from extracted folder
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cp -f "$SCRIPT_DIR/mcp/index.js" "$MCP/index.js"
cp -f "$SCRIPT_DIR/mcp/run.sh"   "$MCP/run.sh"
chmod +x "$MCP/run.sh"

# user scope
claude mcp remove kip -s user 2>/dev/null || true
claude mcp add    kip --transport stdio --scope user "$MCP/run.sh"   --env KIP_URL="$KIP_URL" --env KIP_TOKEN="$KIP_TOKEN"

# local scope for /opt/k3s (if exists)
if [ -d /opt/k3s ]; then
  ( cd /opt/k3s;     claude mcp remove kip -s local 2>/dev/null || true;     claude mcp add    kip --transport stdio --scope local "$MCP/run.sh"       --env KIP_URL="$KIP_URL" --env KIP_TOKEN="$KIP_TOKEN" )
fi

claude mcp list | sed -n '/ kip /p'
