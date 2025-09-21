# KIP Troubleshooting Guide

## Fixed Issue (2025-09-21): Port Mismatch Causing "Bad FIND syntax" Errors

### Problem Description
All KIP queries were failing with "Bad FIND syntax" or parse errors, even with valid KQL syntax.

### Root Cause
**Port configuration mismatch**: The HTTP wrapper commands (`kip-query` and `kip-upsert`) were configured to use port 8081, but Docker Compose maps the KIP Nexus service to port 8083 on the host.

### Technical Details
1. **Docker Compose Configuration** (`docker-compose.yml`):
   ```yaml
   ports:
     - "8083:8081"  # Maps container port 8081 to host port 8083
   ```

2. **Broken Wrapper Scripts** (before fix):
   ```bash
   # /usr/local/bin/kip-query was using wrong port:
   curl -s -X POST http://localhost:8081/execute_kip  # WRONG - port 8081 not accessible
   ```

3. **Error Manifestation**:
   - All queries returned `{"error": "Bad FIND syntax"}`
   - Valid UPSERT operations failed with parse errors
   - The actual KIP server was running fine, just unreachable

### Solution Applied
Changed port from 8081 to 8083 in both wrapper scripts:

```bash
# Fixed the kip-query wrapper
sudo sed -i 's/localhost:8081/localhost:8083/g' /usr/local/bin/kip-query

# Fixed the kip-upsert wrapper
sudo sed -i 's/localhost:8081/localhost:8083/g' /usr/local/bin/kip-upsert
```

### Verification
After the fix, all queries work correctly:
```bash
# These now work:
kip-query "FIND Task WHERE name = 'Test Task'"                    # ✅ Returns results
kip-query "UPSERT Project {name: 'KIP', status: 'completed'}"     # ✅ Creates successfully
```

### Why This Happened
During installation, the wrapper scripts were created with the internal container port (8081) instead of the externally mapped port (8083). This is a common Docker networking confusion where the internal and external ports differ.

---

## Problem: KIP Tools Not Working in Claude Code TUI

### Symptoms:
- `/kip:ensure_kip_header` returns "KIP_HEADER_DONE" immediately (mock response)
- All KIP queries fail with "Bad FIND syntax" or "UPSERT requires name"
- `claude mcp list` shows KIP as "✓ Connected" but tools don't work
- Commands appear to run but no actual KIP operations occur

### Root Cause Analysis:

#### 1. MCP Scope Isolation
**Issue**: Claude Code TUI sessions don't inherit MCP registrations from CLI
- MCP servers registered via `claude mcp add` work for CLI commands
- But Claude Code TUI runs in isolated context without those tools
- This is a fundamental architecture limitation

#### 2. Tool Discovery Failure
**Evidence**:
```bash
# This works (CLI):
claude --print "/kip FIND Policy WHERE name='Test'"

# This fails (TUI):
> /kip:ensure_kip_header (MCP) is running…
● KIP_HEADER_DONE.  # Mock response, not real tool
```

#### 3. Query Syntax Errors
**Wrong Syntax Examples**:
```bash
{"query":"FIND * LIMIT 3"}           # Missing WHERE clause
{"query":"FIND Project"}             # No WHERE clause
{"query":"FIND Session W..."}        # Incomplete WHERE
{"query":"UPSERT Session..."}        # Missing name field
```

**Correct Syntax**:
```bash
{"query":"FIND Policy WHERE name = 'Test Policy'"}
{"query":"UPSERT Project {name: 'K3s', type: 'kubernetes'}"}
```

## Solutions:

### Solution 1: Direct API Wrapper (Immediate Fix)

Create shell wrappers that bypass MCP entirely:

```bash
# /usr/local/bin/kip-query
#!/bin/bash
curl -s -X POST http://localhost:8083/execute_kip \
  -H "Authorization: Bearer changeme-kip-token" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"$*\"}" | jq .
```

### Solution 2: Fix Command Files (Medium-term)

Update command files to use direct HTTP calls instead of MCP tools:

```markdown
# ~/.claude/commands/kip.md
Use bash to execute:
curl -X POST http://localhost:8081/execute_kip \
  -H "Authorization: Bearer changeme-kip-token" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"$QUERY\"}"
```

### Solution 3: TUI-Specific MCP Registration (Long-term)

Need to find Claude Code TUI's actual configuration location and register MCP there.

## Quick Fix Implementation:

### Step 1: Create Direct KIP Tools
```bash
# Create working directory
sudo mkdir -p /usr/local/bin

# Create kip-query wrapper
sudo tee /usr/local/bin/kip-query << 'EOF'
#!/bin/bash
curl -s -X POST http://localhost:8083/execute_kip \
  -H "Authorization: Bearer changeme-kip-token" \
  -H "Content-Type: application/json" \
  -d "{\"query\":\"$*\"}" | jq .
EOF

sudo chmod +x /usr/local/bin/kip-query
```

### Step 2: Test Direct Access
```bash
# Test basic query
kip-query "FIND Policy WHERE name = 'Test'"

# Test upsert
kip-query "UPSERT Project {name: 'K3s', type: 'kubernetes'}"
```

### Step 3: Update Command Files
Replace MCP tool calls with direct HTTP calls in all command files.

## Verification Steps:

### 1. Check KIP Server Status
```bash
curl -s http://localhost:8083/.well-known/ai-plugin.json | jq .name_for_human
# Should return: "KIP Nexus"
```

### 2. Test Query Syntax
```bash
# Valid queries:
FIND Policy WHERE name = 'Password Rotation'
FIND Session WHERE project = 'K3s-Cluster'
UPSERT Config {name: 'timeout', value: '30s'}

# Invalid queries:
FIND * LIMIT 3           # No WHERE clause
FIND Policy              # No WHERE clause
UPSERT Session           # Missing data object
```

### 3. Check MCP Bridge
```bash
# Direct MCP test (won't work in TUI but shows status):
echo '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node /opt/projects/kip-mcp/index.js
```

## Prevention:

### 1. Command File Standards
- Never use MCP tools directly in command files
- Always use HTTP calls to KIP server
- Include proper error handling

### 2. Documentation
- Document correct query syntax in all command files
- Include examples for common operations
- Add troubleshooting sections

### 3. Testing
- Test command files in actual TUI sessions
- Don't rely on CLI testing only
- Verify both success and error cases

## Emergency Rollback:

If KIP integration is completely broken:

```bash
# Remove all KIP enhancements
bash /opt/projects/kip/scripts/uninstall-kip-claude.sh

# Restore from backup
ls ~/.claude/backups/
rsync -av ~/.claude/backups/YYYYMMDD_HHMMSS/ ~/.claude/commands/
```

## Status Indicators:

### Working KIP:
- HTTP calls return JSON with `"ok": true`
- Data persists between sessions
- Commands execute without syntax errors

### Broken KIP:
- Commands return mock responses
- "Bad FIND syntax" errors
- No actual data persistence
- MCP tools show as connected but don't work