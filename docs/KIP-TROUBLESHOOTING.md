# KIP Integration Troubleshooting Guide

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
curl -s -X POST http://localhost:8081/execute_kip \
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
curl -s -X POST http://localhost:8081/execute_kip \
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
curl -s http://localhost:8081/.well-known/ai-plugin.json | jq .name_for_human
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