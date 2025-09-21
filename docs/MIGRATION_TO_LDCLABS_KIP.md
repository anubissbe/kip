# Migration Strategy: Current KIP to ldclabs/KIP Protocol Compliance

## Executive Summary
Transform the current simple KIP implementation into a fully compliant ldclabs/KIP protocol system while maintaining Claude Code TUI integration and enforcement mechanisms.

## Architecture Analysis

### Current Implementation
```
Claude Code TUI → MCP Bridge → KIP Nexus → Neo4j
                ↓
          HTTP Wrappers (kip-query, kip-upsert)
```

### Target Architecture (ldclabs/KIP Compliant)
```
Claude Code TUI → MCP Bridge → KIP Protocol Server → Neo4j
                ↓                      ↓
          HTTP Wrappers          KQL Engine
                                      ↓
                            Concept-Proposition Graph
```

## Implementation Phases

### Phase 1: KQL Parser Implementation (2-3 weeks)

#### 1.1 Parser Development
```javascript
// nexus/kql-parser.js - New KQL parser module
import nearley from 'nearley';
import grammar from './kql-grammar.js';

export class KQLParser {
  constructor() {
    this.parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
  }

  parse(query) {
    // Parse KQL syntax: FIND, WHERE, FILTER, OPTIONAL, UNION, NOT
    // Return AST for execution
  }
}
```

#### 1.2 Grammar Definition
```
# kql-grammar.ne (Nearley grammar)
@builtin "whitespace.ne"

Query → FindClause WhereClause:? FilterClause:? OptionalClause:? UnionClause:?

FindClause → "FIND" _ Output
Output → "*" | Identifier ("," _ Identifier):*

WhereClause → "WHERE" _ Pattern
Pattern → TriplePattern ("," _ TriplePattern):*

FilterClause → "FILTER" _ Expression
OptionalClause → "OPTIONAL" _ Pattern
UnionClause → "UNION" _ Query
```

#### 1.3 Backward Compatibility Layer
```javascript
// Maintain support for existing simple queries
if (isSimpleQuery(query)) {
  return handleLegacyQuery(query); // Current regex-based
} else {
  return kqlParser.parse(query);    // New KQL parser
}
```

### Phase 2: Data Model Migration (1-2 weeks)

#### 2.1 Neo4j Schema Update
```cypher
// Create Concept and Proposition node types
CREATE CONSTRAINT concept_name IF NOT EXISTS
  ON (c:Concept) ASSERT c.name IS UNIQUE;

CREATE CONSTRAINT proposition_id IF NOT EXISTS
  ON (p:Proposition) ASSERT p.id IS UNIQUE;

// Migrate existing nodes to Concepts
MATCH (n)
WHERE NOT n:Concept AND NOT n:Proposition
SET n:Concept, n.type = labels(n)[0]
REMOVE n:Policy, n:Task, n:Session // Remove old labels
```

#### 2.2 Proposition Relationships
```javascript
// Transform flat properties to Concept-Proposition model
class ConceptPropositionTransformer {
  transformUpsert(label, properties) {
    // Create Concept node
    const concept = {
      type: '$ConceptType',
      name: properties.name,
      attributes: properties
    };

    // Create Propositions for relationships
    const propositions = Object.entries(properties)
      .filter(([key]) => key !== 'name')
      .map(([key, value]) => ({
        type: '$PropositionType',
        subject: properties.name,
        predicate: key,
        object: value
      }));

    return { concept, propositions };
  }
}
```

### Phase 3: Claude Code Integration (1 week)

#### 3.1 MCP Bridge Updates
```javascript
// mcp/index.js updates
const tools = [
  {
    name: "execute_kql",  // New KQL execution
    description: "Execute KQL query with full protocol support",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string" },
        mode: { enum: ["kql", "legacy"], default: "kql" }
      }
    }
  },
  // Keep legacy for compatibility
  { name: "execute_kip", description: "Legacy KIP query (deprecated)" }
];
```

#### 3.2 HTTP Wrapper Updates
```bash
# /opt/k3s/kip-query wrapper update
#!/bin/bash
QUERY="$1"
MODE="${2:-kql}"  # Default to KQL mode

# Auto-detect query type
if [[ "$QUERY" =~ ^FIND.*WHERE.*=.*$ ]]; then
  MODE="legacy"  # Use legacy for simple queries
fi

curl -X POST http://localhost:8081/execute_kql \
  -H "Authorization: Bearer $KIP_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"query\": \"$QUERY\", \"mode\": \"$MODE\"}"
```

#### 3.3 CLAUDE.md Enforcement Update
```markdown
<!-- KIP-HEADER START -->
## KIP Protocol Enforcement (ldclabs/KIP compliant)

**Rules**:
1) Use KQL syntax for knowledge operations (FIND, WHERE, FILTER, OPTIONAL, UNION)
2) All knowledge stored as Concept-Proposition graph
3) Maintain chain-of-thought with metadata tracking
4) Two-way cognitive symbiosis via MCP bridge

**Query Examples**:
- `FIND Concept WHERE type = 'Task' FILTER status != 'completed'`
- `FIND * WHERE subject = 'project' OPTIONAL propositions`
<!-- KIP-HEADER END -->
```

### Phase 4: Cognitive Symbiosis Features (2 weeks)

#### 4.1 Bidirectional Communication
```javascript
// Enable KIP to query Claude for clarification
class CognitiveInterface {
  async requestClarification(ambiguousQuery) {
    return await mcp.invoke('get_clarification', {
      query: ambiguousQuery,
      context: this.getContext()
    });
  }

  async suggestQueries(context) {
    // KIP suggests relevant queries based on context
    const patterns = this.analyzeContext(context);
    return this.generateQuerySuggestions(patterns);
  }
}
```

#### 4.2 Metadata Tracking
```javascript
// Track knowledge provenance and chain-of-thought
class MetadataTracker {
  trackQuery(query, result) {
    return {
      timestamp: new Date().toISOString(),
      query,
      result,
      session: this.sessionId,
      reasoning: this.captureReasoning(),
      confidence: this.calculateConfidence(result)
    };
  }
}
```

## Testing Strategy

### Compatibility Tests
```bash
# Test legacy queries still work
kip-query "FIND Task WHERE name = 'test'"  # Should work

# Test new KQL queries
kip-query "FIND Concept WHERE type = 'Task' FILTER priority = 'high'"
kip-query "FIND * WHERE subject = 'project' UNION FIND * WHERE object = 'project'"
```

### Migration Validation
```javascript
// Automated test suite
describe('KIP to ldclabs/KIP Migration', () => {
  test('Legacy queries remain functional', () => {
    const result = kip.execute("FIND Task WHERE name = 'test'");
    expect(result).toBeDefined();
  });

  test('KQL queries execute correctly', () => {
    const result = kip.execute("FIND Concept FILTER type = 'Task'");
    expect(result).toMatchKQLSpec();
  });

  test('Concept-Proposition model active', () => {
    const result = kip.execute("FIND Proposition WHERE subject = 'test'");
    expect(result).toHavePropositionStructure();
  });
});
```

## Rollback Plan

```bash
# If migration fails, restore from backup:
bash /opt/projects/kip-backup-20250920_224102/restore.sh

# Or selectively rollback components:
cd /opt/projects/kip
git checkout nexus/server.js  # Restore specific file
docker compose down
docker compose up -d --build
```

## Timeline & Resources

| Phase | Duration | Complexity | Risk |
|-------|----------|------------|------|
| Phase 1: KQL Parser | 2-3 weeks | High | Medium |
| Phase 2: Data Model | 1-2 weeks | Medium | Low |
| Phase 3: Integration | 1 week | Low | Low |
| Phase 4: Cognitive | 2 weeks | High | Medium |
| **Total** | **6-8 weeks** | **High** | **Medium** |

## Success Criteria

1. ✅ Full KQL syntax support (FIND, WHERE, FILTER, OPTIONAL, UNION, NOT)
2. ✅ Concept-Proposition graph model active
3. ✅ Metadata and provenance tracking
4. ✅ Backward compatibility maintained
5. ✅ Claude Code TUI enforcement working
6. ✅ Two-way cognitive communication enabled

## Critical: Claude Code Automatic Enforcement

### Enforcement Mechanisms (MANDATORY)

The migration MUST maintain automatic KIP usage enforcement for Claude Code. This is achieved through multiple layers:

#### 1. MCP Server Header Injection (Primary)
```javascript
// mcp/index.js - Automatic enforcement on EVERY interaction
server.setRequestHandler(CallToolRequestSchema, async (req) => {
  // ALWAYS inject KIP enforcement before any response
  await ensureKIPCompliance();

  // Block responses without KIP usage
  if (!hasKIPQuery && !isTrivialRequest) {
    return {
      error: "KIP query required. Use: FIND Concept WHERE field = 'value'"
    };
  }
});
```

#### 2. CLAUDE.md Auto-Patching (Secondary)
```bash
# Runs automatically on:
# - Every /init command
# - Every project load
# - Every session start
kip-header  # Injects enforcement rules into CLAUDE.md
```

#### 3. Command Wrapper Enforcement (Tertiary)
```bash
# All commands in ~/.claude/commands/** are patched with:
<!-- KIP-ENFORCEMENT-START -->
SYSTEM REMINDER: Always use KIP for knowledge operations
Output: KIP_PLAN → KIP_CALLS → FINAL_ANSWER
<!-- KIP-ENFORCEMENT-END -->
```

#### 4. Response Validation Hook (Quaternary)
```javascript
// Validate EVERY Claude response before display
class ResponseValidator {
  validate(response) {
    if (!response.includes("KIP_CALLS") && needsKIP(response)) {
      return this.blockResponse("Missing required KIP usage");
    }
    return response;
  }
}
```

### Automatic Usage Pattern

When a user asks ANY non-trivial question in Claude Code:

1. **Pre-Processing**: MCP server detects request
2. **Enforcement Check**: Validates KIP requirement
3. **Query Generation**: Forces KQL query creation
4. **Response Format**: Enforces KIP_PLAN → KIP_CALLS → FINAL_ANSWER
5. **Post-Validation**: Blocks non-compliant responses

### Example Enforcement Flow

```javascript
// User asks: "What tasks are pending?"

// AUTOMATIC enforcement kicks in:
// 1. MCP detects knowledge query need
// 2. Forces KQL generation:
const query = "FIND Concept WHERE type = 'Task' FILTER status = 'pending'";

// 3. Blocks response without KIP:
if (!kipQueryExecuted) {
  throw new EnforcementError("KIP usage required for knowledge queries");
}

// 4. Only allows properly formatted response:
validateResponseFormat(response); // Must have KIP_CALLS section
```

### Testing Automatic Enforcement

```bash
# Test 1: Verify enforcement is active
claude --test "What is 2+2?"  # Should work (trivial)
claude --test "What tasks exist?"  # Should force KIP query

# Test 2: Verify bypass is blocked
claude --no-kip "Find all projects"  # Should be BLOCKED

# Test 3: Verify format enforcement
claude --test "List concepts"  # Must output KIP_PLAN → KIP_CALLS → FINAL_ANSWER
```

## Next Steps

1. **Implement Enforcement Layer First** (Critical)
   - Update mcp/index.js with strict enforcement
   - Add response validation hooks
   - Test blocking mechanisms

2. **Then Begin KQL Parser** (Phase 1)
   - Set up development branch
   - Install parser dependencies
   - Create grammar definition

3. **Maintain Enforcement Throughout Migration**
   - Never disable enforcement
   - Test after each change
   - Validate automatic usage