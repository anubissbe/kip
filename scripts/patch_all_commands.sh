#!/bin/bash
set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}=== KIP Enforcement Extension Script ===${NC}"
echo "Extending KIP enforcement across all Serena and SuperClaude command sets..."
echo

# Create timestamp for backup
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="$HOME/.claude/backups/$TIMESTAMP"
COMMANDS_DIR="$HOME/.claude/commands"

# Step 1: Create backup
echo -e "${YELLOW}[1/9] Creating backup...${NC}"
mkdir -p "$BACKUP_DIR"
if [ -d "$COMMANDS_DIR" ]; then
    rsync -av "$COMMANDS_DIR/" "$BACKUP_DIR/" > /dev/null 2>&1
    echo -e "${GREEN}✓ Backup created at: $BACKUP_DIR${NC}"
else
    echo -e "${YELLOW}⚠ Commands directory not found, creating it...${NC}"
    mkdir -p "$COMMANDS_DIR"
fi

# Step 2: Define the KIP enforcement header
KIP_HEADER_START="<!-- KIP-ENFORCEMENT-START -->"
KIP_HEADER_END="<!-- KIP-ENFORCEMENT-END -->"
KIP_HEADER="${KIP_HEADER_START}
SYSTEM REMINDER (enforce strictly):
- Always use the MCP tool \`execute_kip\` for any knowledge read/write (FIND/UPSERT/DELETE/...).
- Do not produce a FINAL ANSWER unless at least one \`execute_kip\` call has been made (except trivial small-talk/formatting).
- Output: KIP_PLAN → KIP_CALLS → FINAL_ANSWER.
${KIP_HEADER_END}"

# Step 3: Define the KIP query shapes guard note
KIP_GUARD_START="<!-- KIP-QUERY-SHAPES-START -->"
KIP_GUARD_END="<!-- KIP-QUERY-SHAPES-END -->"
KIP_GUARD="
${KIP_GUARD_START}
## KIP QUERY SHAPES (allowed)
- FIND <Label> WHERE field = 'value' [LIMIT n]
- FIND <Label> WHERE field CONTAINS 'value' [LIMIT n]
- FIND * LIMIT n
- UPSERT <Label> {name: 'value', field: 'value'}
- DELETE <Label> WHERE field = 'value'
${KIP_GUARD_END}"

# Step 4: Function to patch a single file
patch_file() {
    local file="$1"
    local modified=false

    # Read file content
    local content=$(cat "$file" 2>/dev/null || echo "")

    # Check and add header if missing
    if ! echo "$content" | grep -q "$KIP_HEADER_START"; then
        content="${KIP_HEADER}

${content}"
        modified=true
    fi

    # Check and add guard note if missing
    if ! echo "$content" | grep -q "$KIP_GUARD_START"; then
        content="${content}

${KIP_GUARD}"
        modified=true
    fi

    # Write back if modified
    if [ "$modified" = true ]; then
        echo "$content" > "$file"
        return 0
    fi
    return 1
}

# Step 5: Process all .md files
echo -e "${YELLOW}[2/9] Patching command files...${NC}"
TOTAL_FILES=0
MODIFIED_FILES=0
SAMPLE_FILES=()

# Find and process all .md files
while IFS= read -r -d '' file; do
    TOTAL_FILES=$((TOTAL_FILES + 1))
    if patch_file "$file"; then
        MODIFIED_FILES=$((MODIFIED_FILES + 1))
        # Store first 2 samples
        if [ ${#SAMPLE_FILES[@]} -lt 2 ]; then
            SAMPLE_FILES+=("$file")
        fi
    fi
done < <(find "$COMMANDS_DIR" -name "*.md" -type f -print0 2>/dev/null || true)

echo -e "${GREEN}✓ Processed $TOTAL_FILES files, modified $MODIFIED_FILES${NC}"

# Step 6: Create global KIP aliases
echo -e "${YELLOW}[3/9] Creating global KIP aliases...${NC}"
mkdir -p "$COMMANDS_DIR"

# /kip alias
cat > "$COMMANDS_DIR/kip.md" << 'EOF'
<!-- KIP-ENFORCEMENT-START -->
SYSTEM REMINDER (enforce strictly):
- Always use the MCP tool `execute_kip` for any knowledge read/write (FIND/UPSERT/DELETE/...).
- Do not produce a FINAL ANSWER unless at least one `execute_kip` call has been made (except trivial small-talk/formatting).
- Output: KIP_PLAN → KIP_CALLS → FINAL_ANSWER.
<!-- KIP-ENFORCEMENT-END -->

# /kip - Execute KIP Query

Execute a KIP query using the MCP bridge.

Usage: `/kip <query>`

Examples:
- `/kip FIND Policy WHERE name = 'Password Rotation'`
- `/kip UPSERT Config {name: 'timeout', value: '30s'}`
- `/kip FIND * LIMIT 5`

Use the MCP tool `execute_kip` with the provided query.

<!-- KIP-QUERY-SHAPES-START -->
## KIP QUERY SHAPES (allowed)
- FIND <Label> WHERE field = 'value' [LIMIT n]
- FIND <Label> WHERE field CONTAINS 'value' [LIMIT n]
- FIND * LIMIT n
- UPSERT <Label> {name: 'value', field: 'value'}
- DELETE <Label> WHERE field = 'value'
<!-- KIP-QUERY-SHAPES-END -->
EOF

# /kip-q alias (quiet mode)
cat > "$COMMANDS_DIR/kip-q.md" << 'EOF'
<!-- KIP-ENFORCEMENT-START -->
SYSTEM REMINDER (enforce strictly):
- Always use the MCP tool `execute_kip` for any knowledge read/write (FIND/UPSERT/DELETE/...).
- Do not produce a FINAL ANSWER unless at least one `execute_kip` call has been made (except trivial small-talk/formatting).
- Output: KIP_PLAN → KIP_CALLS → FINAL_ANSWER.
<!-- KIP-ENFORCEMENT-END -->

# /kip-q - Execute KIP Query (Quiet)

Execute a KIP query and return only the JSON result.

Usage: `/kip-q <query>`

Use the MCP tool `execute_kip` with the provided query and output only the raw JSON response.

<!-- KIP-QUERY-SHAPES-START -->
## KIP QUERY SHAPES (allowed)
- FIND <Label> WHERE field = 'value' [LIMIT n]
- FIND <Label> WHERE field CONTAINS 'value' [LIMIT n]
- FIND * LIMIT n
- UPSERT <Label> {name: 'value', field: 'value'}
- DELETE <Label> WHERE field = 'value'
<!-- KIP-QUERY-SHAPES-END -->
EOF

# /kip-now alias (immediate enforcement)
cat > "$COMMANDS_DIR/kip-now.md" << 'EOF'
<!-- KIP-ENFORCEMENT-START -->
SYSTEM REMINDER (enforce strictly):
- Always use the MCP tool `execute_kip` for any knowledge read/write (FIND/UPSERT/DELETE/...).
- Do not produce a FINAL ANSWER unless at least one `execute_kip` call has been made in this turn (except trivial small-talk or formatting).
- For non-trivial tasks, produce:
  1. **KIP_PLAN**
  2. **KIP_CALLS** (execute_kip invocations)
  3. **FINAL_ANSWER** (based on KIP results)

Reply only with: `KIP_REMINDER_SET`.

<!-- KIP-QUERY-SHAPES-START -->
## KIP QUERY SHAPES (allowed)
- FIND <Label> WHERE field = 'value' [LIMIT n]
- FIND <Label> WHERE field CONTAINS 'value' [LIMIT n]
- FIND * LIMIT n
- UPSERT <Label> {name: 'value', field: 'value'}
- DELETE <Label> WHERE field = 'value'
<!-- KIP-QUERY-SHAPES-END -->
EOF

echo -e "${GREEN}✓ Created /kip, /kip-q, /kip-now aliases${NC}"

# Step 7: Create Serena/SuperClaude wrappers if base folders exist
echo -e "${YELLOW}[4/9] Creating Serena/SuperClaude wrappers...${NC}"

# Check for Serena
if [ -d "$COMMANDS_DIR/serena" ]; then
    cat > "$COMMANDS_DIR/serena-kip.md" << 'EOF'
<!-- KIP-ENFORCEMENT-START -->
SYSTEM REMINDER (enforce strictly):
- Always use the MCP tool `execute_kip` for any knowledge read/write (FIND/UPSERT/DELETE/...).
- Do not produce a FINAL ANSWER unless at least one `execute_kip` call has been made (except trivial small-talk/formatting).
- Output: KIP_PLAN → KIP_CALLS → FINAL_ANSWER.
<!-- KIP-ENFORCEMENT-END -->

# /serena-kip - Serena with KIP Enforcement

Execute Serena commands with strict KIP enforcement for knowledge operations.

Usage: `/serena-kip <command>`

This wrapper ensures all Serena operations use KIP for knowledge persistence.

<!-- KIP-QUERY-SHAPES-START -->
## KIP QUERY SHAPES (allowed)
- FIND <Label> WHERE field = 'value' [LIMIT n]
- FIND <Label> WHERE field CONTAINS 'value' [LIMIT n]
- FIND * LIMIT n
- UPSERT <Label> {name: 'value', field: 'value'}
- DELETE <Label> WHERE field = 'value'
<!-- KIP-QUERY-SHAPES-END -->
EOF
    echo -e "${GREEN}✓ Created /serena-kip wrapper${NC}"
else
    echo -e "${YELLOW}⚠ Serena directory not found, skipping wrapper${NC}"
fi

# Check for SuperClaude
if [ -d "$COMMANDS_DIR/sc" ] || [ -d "$COMMANDS_DIR/superclaude" ]; then
    cat > "$COMMANDS_DIR/superclaude-kip.md" << 'EOF'
<!-- KIP-ENFORCEMENT-START -->
SYSTEM REMINDER (enforce strictly):
- Always use the MCP tool `execute_kip` for any knowledge read/write (FIND/UPSERT/DELETE/...).
- Do not produce a FINAL ANSWER unless at least one `execute_kip` call has been made (except trivial small-talk/formatting).
- Output: KIP_PLAN → KIP_CALLS → FINAL_ANSWER.
<!-- KIP-ENFORCEMENT-END -->

# /superclaude-kip - SuperClaude with KIP Enforcement

Execute SuperClaude commands with strict KIP enforcement for knowledge operations.

Usage: `/superclaude-kip <command>`

This wrapper ensures all SuperClaude operations use KIP for knowledge persistence.

<!-- KIP-QUERY-SHAPES-START -->
## KIP QUERY SHAPES (allowed)
- FIND <Label> WHERE field = 'value' [LIMIT n]
- FIND <Label> WHERE field CONTAINS 'value' [LIMIT n]
- FIND * LIMIT n
- UPSERT <Label> {name: 'value', field: 'value'}
- DELETE <Label> WHERE field = 'value'
<!-- KIP-QUERY-SHAPES-END -->
EOF
    echo -e "${GREEN}✓ Created /superclaude-kip wrapper${NC}"
else
    echo -e "${YELLOW}⚠ SuperClaude directory not found, skipping wrapper${NC}"
fi

# Step 8: Run sanity tests
echo -e "${YELLOW}[5/9] Running MCP connectivity test...${NC}"
if claude mcp list | grep -q "kip.*Connected"; then
    echo -e "${GREEN}✓ KIP MCP is connected${NC}"
else
    echo -e "${RED}✗ KIP MCP not connected!${NC}"
fi

echo -e "${YELLOW}[6/9] Testing KIP header enforcement...${NC}"
HEADER_TEST=$(claude --print "/mcp__kip__ensure_kip_header" 2>&1 || echo "FAILED")
if echo "$HEADER_TEST" | grep -q "KIP header"; then
    echo -e "${GREEN}✓ Header enforcement working${NC}"
else
    echo -e "${YELLOW}⚠ Header test returned: $(echo $HEADER_TEST | head -c 50)...${NC}"
fi

echo -e "${YELLOW}[7/9] Testing KIP query execution...${NC}"
QUERY_TEST=$(curl -s -X POST -H "Authorization: Bearer changeme-kip-token" \
    -H "Content-Type: application/json" \
    http://localhost:8081/execute_kip \
    -d '{"query":"FIND Policy WHERE name = '\''Password Rotation'\''"}' 2>&1 || echo '{"error":"offline"}')

if echo "$QUERY_TEST" | grep -q '"ok":\s*true'; then
    echo -e "${GREEN}✓ KIP queries working${NC}"
    echo "Sample result: $(echo $QUERY_TEST | head -c 100)..."
elif echo "$QUERY_TEST" | grep -q "offline"; then
    echo -e "${YELLOW}⚠ KIP server appears offline${NC}"
else
    echo -e "${GREEN}✓ KIP server responding${NC}"
fi

# Step 9: Show sample file headers
echo -e "${YELLOW}[8/9] Sample patched files:${NC}"
for sample in "${SAMPLE_FILES[@]:0:2}"; do
    if [ -f "$sample" ]; then
        echo -e "${GREEN}File: $sample${NC}"
        head -n 10 "$sample" | sed 's/^/  /'
        echo
    fi
done

# Step 10: Generate summary
echo -e "${YELLOW}[9/9] Summary Report${NC}"
echo "========================================"
echo -e "${GREEN}✓ SUCCESS: KIP enforcement extended${NC}"
echo
echo "Statistics:"
echo "  • Files scanned: $TOTAL_FILES"
echo "  • Files modified: $MODIFIED_FILES"
echo "  • Backup location: $BACKUP_DIR"
echo "  • Aliases created: /kip, /kip-q, /kip-now"
echo
echo "Rollback Instructions:"
echo "  To rollback all changes, run:"
echo -e "  ${YELLOW}rsync -av --delete $BACKUP_DIR/ $COMMANDS_DIR/${NC}"
echo
echo "Test Commands:"
echo "  • claude /kip FIND Policy WHERE name = 'Password Rotation'"
echo "  • claude /kip-q FIND * LIMIT 3"
echo "  • claude /kip-now"
echo
echo "========================================"
echo -e "${GREEN}KIP enforcement extension complete!${NC}"