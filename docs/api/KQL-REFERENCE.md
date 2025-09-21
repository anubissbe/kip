# Knowledge Query Language (KQL) Reference

**Version**: 1.0.0
**Compliance**: ldclabs/KIP Protocol 98.47%
**Last Updated**: 2025-09-21

---

## Overview

Knowledge Query Language (KQL) is KIP's specialized query language for interacting with knowledge graphs. KQL provides intuitive, SQL-like syntax for finding, creating, and analyzing knowledge relationships.

## Basic Syntax

### FIND Operations

#### Simple Queries
```sql
-- Find all tasks
FIND Task

-- Find tasks with specific status
FIND Task WHERE status = 'active'

-- Find with multiple conditions
FIND Project WHERE team = 'engineering' AND priority = 'high'
```

#### Comparison Operators
```sql
-- Equality
FIND Task WHERE priority = 'high'

-- Inequality (not supported in current version)
-- FIND Task WHERE priority != 'low'  -- Not yet implemented

-- Numeric comparisons (through type system)
FIND Project WHERE metadata.budget = 50000
```

#### Limit and Pagination
```sql
-- Limit results
FIND Task WHERE status = 'active' LIMIT 10

-- Cursor-based pagination
FIND Task LIMIT 10 CURSOR 'eyJxdWVyeUhhc2giOiJhYmMxMjMi...'
```

### UPSERT Operations

#### Basic Entity Creation
```sql
-- Create a simple task
UPSERT Task {
  name: 'Review Documentation',
  status: 'pending',
  assignee: 'john'
}

-- Create with nested properties
UPSERT Project {
  name: 'KIP Enhancement',
  team: 'engineering',
  metadata.budget: 75000,
  metadata.deadline: '2024-03-15'
}
```

#### Data Types
```sql
-- String values
UPSERT Task {name: 'Complete Testing'}

-- Numeric values
UPSERT Project {priority: 5, budget: 50000}

-- Boolean values
UPSERT Task {completed: true, urgent: false}

-- Date values (ISO 8601 format)
UPSERT Task {created: '2024-01-15T10:30:00Z'}
```

## Advanced Features

### Dot Notation

#### Nested Property Access
```sql
-- Query nested properties
FIND Task WHERE metadata.priority = 'high'
FIND Project WHERE team.lead = 'sarah'
FIND Document WHERE metadata.tags.category = 'technical'

-- Create nested properties
UPSERT Task {
  name: 'API Documentation',
  metadata.type: 'documentation',
  metadata.priority: 'high',
  metadata.tags: 'api,docs,review'
}
```

### Aggregation Functions

#### Basic Aggregations
```sql
-- Count all tasks
FIND Task AGGREGATE COUNT(*)

-- Multiple aggregations
FIND Task AGGREGATE COUNT(*), MAX(created), MIN(created)

-- Count with grouping
FIND Task GROUP BY status AGGREGATE COUNT(*)

-- Complex aggregations
FIND Project GROUP BY team AGGREGATE COUNT(*), AVG(budget), MAX(deadline)
```

#### Supported Aggregation Functions
| Function | Description | Example |
|----------|-------------|---------|
| `COUNT(*)` | Count all rows | `AGGREGATE COUNT(*)` |
| `COUNT(field)` | Count non-null values | `AGGREGATE COUNT(assignee)` |
| `SUM(field)` | Sum numeric values | `AGGREGATE SUM(budget)` |
| `AVG(field)` | Average of values | `AGGREGATE AVG(priority)` |
| `MIN(field)` | Minimum value | `AGGREGATE MIN(created)` |
| `MAX(field)` | Maximum value | `AGGREGATE MAX(deadline)` |
| `DISTINCT(field)` | Count unique values | `AGGREGATE DISTINCT(team)` |

### Filtering

#### Post-Query Filtering
```sql
-- Basic filtering
FIND Task WHERE team = 'engineering' FILTER status = 'active'

-- Multiple filters
FIND Project WHERE type = 'internal' FILTER priority = 'high' AND budget > 10000

-- Nested property filtering
FIND Task WHERE assignee = 'john' FILTER metadata.priority = 'urgent'
```

### Semantic Search

#### Similarity Queries
```sql
-- Find concepts similar to a term
FIND Concept WHERE similarity('machine learning') > 0.8

-- Combined semantic and structured search
FIND Project WHERE similarity('artificial intelligence') > 0.7 AND status = 'active'

-- Semantic search with pagination
FIND Concept WHERE similarity('data science') > 0.6 LIMIT 5 CURSOR 'token123'
```

## Response Format

### Standard Query Response
```json
{
  "ok": true,
  "data": [
    {
      "concept": {
        "properties": {
          "name": "Review Documentation",
          "status": "active",
          "assignee": "john",
          "created": "2024-01-15T10:30:00Z"
        }
      },
      "propositions": [
        {
          "predicate": "assigned_to",
          "object": "john",
          "confidence": 1.0
        }
      ]
    }
  ],
  "pagination": {
    "hasMore": true,
    "cursor": "eyJxdWVyeUhhc2giOiJhYmMxMjMi...",
    "limit": 10
  },
  "metadata": {
    "query_type": "standard",
    "execution_time": "45ms",
    "has_aggregation": false
  }
}
```

### Aggregation Response
```json
{
  "ok": true,
  "data": [
    {
      "status": "active",
      "count_all": 15,
      "avg_priority": 3.2
    },
    {
      "status": "completed",
      "count_all": 8,
      "avg_priority": 2.8
    }
  ],
  "metadata": {
    "query_type": "aggregation",
    "execution_time": "32ms",
    "has_aggregation": true
  }
}
```

### Error Response
```json
{
  "ok": false,
  "error": "KQL parse error: Invalid syntax near 'INVALID'",
  "code": "KIP001",
  "position": 12,
  "suggestion": "Check query syntax. Expected WHERE clause after FIND."
}
```

## Query Optimization

### Performance Best Practices

#### Index Usage
```sql
-- Good: Uses index on 'status' field
FIND Task WHERE status = 'active'

-- Good: Uses index on 'team' field
FIND Project WHERE team = 'engineering'

-- Avoid: Complex nested property queries without indexes
-- FIND Task WHERE metadata.nested.deep.property = 'value'
```

#### Limit Usage
```sql
-- Good: Always use LIMIT for large datasets
FIND Task WHERE status = 'active' LIMIT 100

-- Good: Use pagination for iterating through results
FIND Task LIMIT 50 CURSOR 'next_page_token'
```

#### Aggregation Optimization
```sql
-- Good: GROUP BY with limited aggregations
FIND Task GROUP BY status AGGREGATE COUNT(*)

-- Avoid: Complex aggregations without GROUP BY on large datasets
-- FIND Task AGGREGATE COUNT(*), SUM(priority), AVG(budget), MIN(created), MAX(deadline)
```

### Query Caching

#### Cache-Friendly Queries
```sql
-- Cached: Exact match queries
FIND Task WHERE status = 'active'

-- Cached: Simple aggregations
FIND Task GROUP BY status AGGREGATE COUNT(*)

-- Not cached: Semantic similarity queries
FIND Concept WHERE similarity('term') > 0.8
```

## Type System Integration

### Schema Validation

#### Automatic Type Checking
```sql
-- Valid: Correct types
UPSERT Task {
  name: 'string value',
  priority: 5,
  completed: true,
  created: '2024-01-15T10:30:00Z'
}

-- Invalid: Type mismatch
-- UPSERT Task {priority: 'not a number'}  -- Validation error
```

#### Type Coercion
```sql
-- Automatic coercion
UPSERT Task {priority: '5'}  -- String '5' coerced to number 5

-- Date parsing
UPSERT Task {deadline: '2024-01-15'}  -- Parsed to ISO 8601 date
```

### Custom Types

#### Concept Types
```sql
-- Predefined concept types
UPSERT Task {type: 'Task'}
UPSERT Project {type: 'Project'}
UPSERT Person {type: 'Person'}

-- Custom types (validated against schema)
UPSERT Document {type: 'TechnicalDocument'}
```

## Error Handling

### Common Errors

#### Syntax Errors
```sql
-- Error: Missing WHERE clause
FIND Task LIMIT 10  -- KIP001: Invalid syntax

-- Error: Invalid operator
FIND Task WHERE status CONTAINS 'active'  -- KIP001: CONTAINS not supported

-- Correct: Use exact equality
FIND Task WHERE status = 'active'
```

#### Type Errors
```sql
-- Error: Invalid type
UPSERT Task {priority: 'invalid'}  -- KIP004: Type validation error

-- Correct: Use proper type
UPSERT Task {priority: 5}
```

#### Authentication Errors
```sql
-- Error: Missing or invalid token
-- HTTP 401: Authentication failed  -- KIP002

-- Correct: Include valid bearer token
-- Authorization: Bearer changeme-kip-token
```

### Error Recovery

#### Retry Strategies
```javascript
// Implement exponential backoff for transient errors
const retryQuery = async (query, maxRetries = 3) => {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await executeKQL(query);
    } catch (error) {
      if (error.code === 'KIP003' && i < maxRetries - 1) {
        await sleep(Math.pow(2, i) * 1000);  // Exponential backoff
        continue;
      }
      throw error;
    }
  }
};
```

## Integration Examples

### HTTP API Integration
```bash
# Execute KQL via HTTP
curl -X POST http://localhost:8083/execute_kip \
  -H "Authorization: Bearer changeme-kip-token" \
  -H "Content-Type: application/json" \
  -d '{"query": "FIND Task WHERE status = '\''active'\'' LIMIT 10"}'
```

### Command Line Integration
```bash
# Use KIP HTTP wrappers
kip-query "FIND Task WHERE status = 'active'"
kip-upsert "Task {name: 'New Task', status: 'pending'}"
```

### JavaScript Integration
```javascript
const KIPClient = require('./kip-client');

const client = new KIPClient({
  baseURL: 'http://localhost:8083',
  token: 'changeme-kip-token'
});

// Execute queries
const tasks = await client.query("FIND Task WHERE status = 'active'");
const newTask = await client.upsert("Task {name: 'New Task', status: 'pending'}");

// Semantic search
const similar = await client.query("FIND Concept WHERE similarity('AI') > 0.8");
```

## Future Enhancements

### Planned Features (v1.1.0+)
- **Range Queries**: `WHERE priority BETWEEN 1 AND 5`
- **Text Search**: `WHERE description CONTAINS 'keyword'`
- **Regular Expressions**: `WHERE name MATCHES '^Task.*'`
- **Temporal Queries**: `WHERE created > NOW() - INTERVAL '7 days'`
- **Graph Traversal**: `TRAVERSE path FROM concept TO concept`

### Experimental Features
- **Natural Language Queries**: `FIND "all active tasks assigned to John"`
- **Query Macros**: `DEFINE MACRO active_tasks AS "FIND Task WHERE status = 'active'"`
- **Subqueries**: `FIND Task WHERE assignee IN (FIND Person WHERE team = 'engineering')`

---

## KQL Grammar (EBNF)

```ebnf
query = find_query | upsert_query

find_query = "FIND" entity_type where_clause? filter_clause? group_by_clause? aggregate_clause? limit_clause? cursor_clause?

upsert_query = "UPSERT" entity_type "{" property_list "}"

where_clause = "WHERE" condition_list

filter_clause = "FILTER" condition_list

group_by_clause = "GROUP BY" field_list

aggregate_clause = "AGGREGATE" aggregate_function_list

limit_clause = "LIMIT" number

cursor_clause = "CURSOR" string

condition_list = condition ("AND" condition)*

condition = field_path "=" value | "similarity(" string ")" ">" number

field_path = identifier ("." identifier)*

property_list = property ("," property)*

property = field_path ":" value

aggregate_function_list = aggregate_function ("," aggregate_function)*

aggregate_function = ("COUNT" "(" ("*" | field_path) ")") |
                    (("SUM" | "AVG" | "MIN" | "MAX" | "DISTINCT") "(" field_path ")")

value = string | number | boolean | date

entity_type = identifier

field_list = field_path ("," field_path)*

identifier = [a-zA-Z_][a-zA-Z0-9_]*

string = "'" [^']* "'"

number = [0-9]+ ("." [0-9]+)?

boolean = "true" | "false"

date = string  # ISO 8601 format
```

---

**📚 KQL Reference - Complete Language Specification**
**🔗 See Also**: [API Reference](./rest-api.md) | [User Guide](../guides/user-guide.md) | [Architecture](../architecture/system-design.md)