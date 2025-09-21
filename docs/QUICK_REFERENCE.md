# KIP Integration Quick Reference

## Essential Commands

### Basic KIP Operations
```bash
# Query for data (only 'name' field works)
kip-query "FIND Label WHERE name = 'exact-value'"

# Insert/Update data
kip-upsert Label "{name: 'value', field: 'data'}"

# Restore KIP headers in CLAUDE.md
kip-header
```

### Dynamic Project Patterns
```bash
# Always detect project name first
PROJECT_NAME=$(basename "$(pwd)")

# Then use in queries
kip-query "FIND Session WHERE name = '${PROJECT_NAME}-Session'"
kip-upsert Session "{name: '${PROJECT_NAME}-Session', status: 'active'}"
```

## What Works ✅

1. **HTTP Wrappers** - Direct HTTP calls to KIP server
   - `/usr/local/bin/kip-query`
   - `/usr/local/bin/kip-upsert`
   - `/usr/local/bin/kip-header`

2. **Query Syntax** - ONLY these patterns work:
   - `FIND Label WHERE name = 'exact-value'`
   - `UPSERT Label {name: 'value', ...}`

3. **Dynamic Detection** - Project-agnostic commands:
   ```bash
   PROJECT_NAME=$(basename "$(pwd)")
   # Works in ANY project directory
   ```

## What Doesn't Work ❌

1. **MCP Tools** - Not available in Claude Code TUI
   - `execute_kip` (MCP tool) - use `kip-query` instead
   - `ensure_kip_header` (MCP tool) - use `kip-header` instead

2. **Query Patterns** - These will fail:
   - `FIND * LIMIT n` (no wildcards)
   - `FIND Label WHERE field CONTAINS 'value'` (no CONTAINS)
   - `FIND Label WHERE project = 'value'` (only 'name' field works)
   - `FIND Label WHERE type = 'value'` (only 'name' field works)

## Common Tasks

### Start New Session
```bash
PROJECT_NAME=$(basename "$(pwd)")
kip-upsert Session "{name: '${PROJECT_NAME}-Session', status: 'active', timestamp: '$(date +%Y-%m-%d)'}"
```

### Store Analysis Results
```bash
PROJECT_NAME=$(basename "$(pwd)")
kip-upsert Analysis "{name: '${PROJECT_NAME}-CodeQuality', findings: 'issues-found', timestamp: '$(date +%Y-%m-%d)'}"
```

### Check Existing Data
```bash
PROJECT_NAME=$(basename "$(pwd)")
kip-query "FIND Session WHERE name = '${PROJECT_NAME}-Session'"
```

### Save Test Results
```bash
PROJECT_NAME=$(basename "$(pwd)")
kip-upsert TestRun "{name: '${PROJECT_NAME}-UnitTests', coverage: '85%', status: 'passed'}"
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Bad FIND syntax" | Use only `WHERE name =` queries |
| "command not found: kip-query" | Check `/usr/local/bin/kip-query` exists |
| Empty results when expecting data | Check exact name spelling |
| Connection refused | Ensure KIP server running on :8081 |

## Environment Variables

```bash
# KIP Server (used by HTTP wrappers)
KIP_URL=http://localhost:8081/execute_kip
KIP_TOKEN=changeme-kip-token

# Neo4j (used by KIP Nexus server)
NEO4J_URI=bolt://neo4j:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=changeme-neo4j
```

## Testing KIP Integration

```bash
# Test query wrapper
kip-query "FIND Project WHERE name = 'TestProject'"

# Test upsert wrapper
kip-upsert Project "{name: 'TestProject', type: 'test'}"

# Test in current project
PROJECT_NAME=$(basename "$(pwd)")
kip-query "FIND Session WHERE name = '${PROJECT_NAME}-Session'"
```

## Key Files

- **HTTP Wrappers**: `/usr/local/bin/kip-*`
- **KIP Server**: `/opt/projects/kip/nexus/server.js`
- **MCP Config**: `~/.config/claude/mcp_settings.json`
- **Command Files**: `/home/drwho/.claude/commands/**/*.md`

---

**Remember**: Always use HTTP wrappers (`kip-query`, `kip-upsert`), never MCP tools in Claude Code TUI!