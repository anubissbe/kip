#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-$HOME/.claude/commands}"

if [ ! -d "$ROOT" ]; then
  echo "No commands directory at $ROOT"; exit 0
fi

marker="SYSTEM REMINDER (enforce strictly):"
while IFS= read -r -d '' file; do
  if ! grep -q "$marker" "$file"; then
    sed -i "1i SYSTEM REMINDER (enforce strictly):\n- Always use the MCP tool \`execute_kip\` for any knowledge read/write (FIND/UPSERT/DELETE/...).\n- Do not produce a FINAL ANSWER unless at least one \`execute_kip\` call has been made (except trivial small-talk/formatting).\n- Output: KIP_PLAN → KIP_CALLS → FINAL_ANSWER.\n" "$file"
    echo "Patched: $file"
  fi
done < <(find "$ROOT" -type f -name "*.md" -print0)
