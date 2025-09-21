#!/bin/bash
# Universal KIP Restore Script - Restores KIP header in current project only
set -euo pipefail

# Find CLAUDE.md in current directory or project root
find_claude_md() {
    # Check current directory first
    if [ -f "./CLAUDE.md" ]; then
        echo "./CLAUDE.md"
        return
    fi

    # Check if we're in a git repo and look at root
    if git rev-parse --git-dir >/dev/null 2>&1; then
        GIT_ROOT=$(git rev-parse --show-toplevel)
        if [ -f "$GIT_ROOT/CLAUDE.md" ]; then
            echo "$GIT_ROOT/CLAUDE.md"
            return
        fi
    fi

    # Check parent directories (up to 3 levels)
    local dir="$PWD"
    for i in 1 2 3; do
        dir=$(dirname "$dir")
        if [ -f "$dir/CLAUDE.md" ]; then
            echo "$dir/CLAUDE.md"
            return
        fi
    done

    echo ""
}

TARGET_FILE=$(find_claude_md)

if [ -z "$TARGET_FILE" ]; then
    # No CLAUDE.md found, nothing to restore
    exit 0
fi

# Only restore if KIP header is missing
if grep -q "KIP-HEADER START" "$TARGET_FILE" 2>/dev/null; then
    # Header already present
    exit 0
fi

echo "Restoring KIP header in: $TARGET_FILE"

KIP_HEADER_START="<!-- KIP-HEADER START -->"
KIP_HEADER_END="<!-- KIP-HEADER END -->"
SENTINEL="<!-- DO NOT REMOVE: KIP-PROJECT-POLICY. If updated by /init, re-run /mcp__kip__ensure_kip_header -->"

KIP_HEADER="${KIP_HEADER_START}

## KIP Enforcement (project policy)

**Role**: Assistant with persistent memory via KIP.

**Rules**:
1) Always use the MCP tool \`execute_kip\` for any knowledge read/write (FIND/UPSERT/DELETE/...).
2) Do **not** produce a FINAL ANSWER unless at least one \`execute_kip\` call has been made in this turn (except trivial small-talk or pure formatting).
3) Output for non-trivial tasks:
   - **KIP_PLAN**
   - **KIP_CALLS** (one or more \`execute_kip\`)
   - **FINAL_ANSWER** (grounded in returned KIP data)

**After compaction**: After any \`/compact\` or auto-compact, call \`ensure_kip_header\` again to restore the header if needed.

${KIP_HEADER_END}"

# Read and clean current content
CURRENT_CONTENT=$(cat "$TARGET_FILE")
CLEANED_CONTENT=$(echo "$CURRENT_CONTENT" | sed "/${KIP_HEADER_START}/,/${KIP_HEADER_END}/d" | sed "/^${SENTINEL}/d")

# Write new content with sentinel and header
echo "${SENTINEL}
${KIP_HEADER}

${CLEANED_CONTENT}" > "$TARGET_FILE"

echo "✅ KIP header restored in $TARGET_FILE"