# CURSOR-based Pagination in KIP

This document demonstrates the CURSOR-based pagination implementation for KQL queries.

## Features Implemented

### 1. CURSOR Token Generation and Management
- **Stateless tokens** that encode: `last_id`, `offset`, `query_hash`, `timestamp`
- **Base64 encoding** for secure cursor tokens
- **AES-256-CBC encryption** for cursor security
- **Query hash validation** to ensure cursor matches the query
- **Expiration handling** (1-hour TTL for security)

### 2. KQL Syntax Extensions
- `LIMIT <number>` - Set maximum number of results (1-1000)
- `CURSOR '<token>'` - Resume pagination from a specific position

### 3. Backward Compatibility
- Existing LIMIT functionality preserved
- No breaking changes to existing queries
- Legacy queries work without modification

## Query Examples

### Basic Pagination
```kql
FIND Policy LIMIT 20
```
Response includes:
```json
{
  "ok": true,
  "data": [...],
  "pagination": {
    "hasMore": true,
    "cursor": "eyJsYXN0X2lkIjoxMjM0NSwib2Zmc2V0Ijo...",
    "limit": 20
  }
}
```

### Cursor-based Continuation
```kql
FIND Policy LIMIT 20 CURSOR 'eyJsYXN0X2lkIjoxMjM0NSwib2Zmc2V0Ijo...'
```

### Complex Queries with Pagination
```kql
FIND Policy WHERE name = 'Security' FILTER status = 'active' LIMIT 10 CURSOR 'cursor_token'
```

## Implementation Details

### Cursor Token Structure
```json
{
  "last_id": 12345,
  "offset": 50,
  "query_hash": "abcd1234",
  "timestamp": 1658461079097
}
```

### Security Features
- **Encryption**: AES-256-CBC with unique IVs
- **Query Validation**: Hash comparison prevents cursor reuse across different queries
- **Expiration**: Tokens expire after 1 hour
- **Tampering Protection**: Encrypted tokens prevent manipulation

### Cypher Translation
KQL with cursor:
```kql
FIND Policy WHERE name = 'Security' LIMIT 10 CURSOR 'token'
```

Becomes Cypher:
```cypher
MATCH (n:Policy)
WHERE n.name = $name AND id(n) > $cursor_last_id
WITH n, id(n) as node_id ORDER BY node_id
RETURN n, collect(p) as propositions, node_id LIMIT 11
```

The `LIMIT 11` requests one extra result to detect if there are more pages.

## API Integration

### Endpoints Supporting Cursor Pagination
- `POST /execute_kip` - Legacy compatibility with cursor support
- `POST /kql` - Full KQL with cursor pagination
- `POST /execute_kql` - Extended legacy support

### Response Format
```json
{
  "ok": true,
  "data": [
    {
      "concept": { "name": "Security Policy", "type": "Policy" },
      "propositions": []
    }
  ],
  "pagination": {
    "hasMore": true,
    "cursor": "base64_encoded_encrypted_token",
    "limit": 20
  }
}
```

## Performance Characteristics

### Advantages over Offset-based Pagination
- **Consistent results**: No duplicate or missing records during pagination
- **O(log n) performance**: Uses indexed node IDs for efficient seeking
- **Large dataset friendly**: Performance doesn't degrade with deep pagination
- **Stateless**: No server-side state required

### Trade-offs
- **Cursor tokens are opaque**: Cannot jump to arbitrary pages
- **Forward-only navigation**: Cannot easily go backwards
- **Query-specific**: Cursors cannot be reused across different queries

## Testing

Run the cursor pagination tests:
```bash
cd /opt/projects/kip/nexus
node test-cursor.js
```

Expected output shows successful:
- LIMIT parsing
- CURSOR token parsing
- Encryption/decryption round-trip
- Query hash generation
- Cursor creation from results

## Environment Configuration

Set encryption key for production:
```bash
export KIP_CURSOR_KEY="your-32-character-encryption-key"
```

Default key is used for development: `'default-cursor-key-32-chars!!!'`

## Migration Guide

### For Existing Applications
1. **No changes required** for basic queries
2. **Optional enhancement**: Parse pagination object in responses
3. **New capability**: Use CURSOR for efficient large dataset traversal

### Best Practices
1. **Store cursor tokens** returned from queries for next page requests
2. **Handle expiration**: Implement fallback when cursors expire
3. **Monitor performance**: Track pagination efficiency in your application
4. **Security**: Don't log or expose cursor tokens in client-side code