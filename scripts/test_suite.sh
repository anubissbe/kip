#!/usr/bin/env bash
set -euo pipefail

echo "[1/3] MCP list:"
claude mcp list | sed -n '/ kip /p' || true

echo "[2/3] Header test:"
cd /opt/k3s 2>/dev/null || true
claude --print --permission-mode bypassPermissions "/mcp__kip__ensure_kip_header" || true
sed -n '1,20p' /opt/k3s/CLAUDE.md 2>/dev/null || true

echo "[3/3] Query test:"
claude --print --permission-mode bypassPermissions "/mcp__kip__run_kip FIND Policy WHERE name='Password Rotation'" || true
