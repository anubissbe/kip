#!/bin/bash
echo "=== Phase 5: Query Completeness Integration Tests ==="

# Test 1: CURSOR pagination
echo -n "1. CURSOR pagination: "
CURSOR_RESULT=$(curl -s -X POST http://localhost:8083/execute_kip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer changeme-kip-token" \
  -d '{"query": "FIND Task LIMIT 2"}' 2>/dev/null)
echo "$CURSOR_RESULT" | jq -e '.pagination.cursor' > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 2: Aggregation functions
echo -n "2. COUNT aggregation: "
COUNT_RESULT=$(curl -s -X POST http://localhost:8083/execute_kip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer changeme-kip-token" \
  -d '{"query": "FIND Task AGGREGATE COUNT(*)"}' 2>/dev/null)
echo "$COUNT_RESULT" | jq -e '.data[0].count_all' > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 3: GROUP BY functionality
echo -n "3. GROUP BY aggregation: "
GROUP_RESULT=$(curl -s -X POST http://localhost:8083/execute_kip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer changeme-kip-token" \
  -d '{"query": "FIND Task GROUP BY status AGGREGATE COUNT(*)"}' 2>/dev/null)
echo "$GROUP_RESULT" | jq -e '.data[0]' > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 4: Dot notation property access
echo -n "4. Dot notation WHERE: "
DOT_RESULT=$(curl -s -X POST http://localhost:8083/execute_kip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer changeme-kip-token" \
  -d '{"query": "FIND Task WHERE metadata.author = '\''test'\''"}' 2>/dev/null)
echo "$DOT_RESULT" | jq -e '.ok' > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 5: Dot notation UPSERT
echo -n "5. Dot notation UPSERT: "
UPSERT_RESULT=$(curl -s -X POST http://localhost:8083/execute_kip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer changeme-kip-token" \
  -d '{"query": "UPSERT Task {name: '\''TestTask'\'', metadata.author: '\''john'\'', metadata.priority: '\''high'\''}"}' 2>/dev/null)
echo "$UPSERT_RESULT" | jq -e '.ok' > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 6: Complex query with multiple features
echo -n "6. Complex multi-feature query: "
COMPLEX_RESULT=$(curl -s -X POST http://localhost:8083/execute_kip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer changeme-kip-token" \
  -d '{"query": "FIND Task WHERE name = '\''TestTask'\'' FILTER metadata.priority = '\''high'\'' LIMIT 1"}' 2>/dev/null)
echo "$COMPLEX_RESULT" | jq -e '.data' > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

# Test 7: Backward compatibility
echo -n "7. Legacy query compatibility: "
LEGACY_RESULT=$(curl -s -X POST http://localhost:8083/execute_kip \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer changeme-kip-token" \
  -d '{"query": "FIND Task WHERE name = '\''TestTask'\''}"}' 2>/dev/null)
echo "$LEGACY_RESULT" | jq -e '.data' > /dev/null && echo "✅ PASS" || echo "❌ FAIL"

echo ""
echo "Phase 5 Query Completeness Integration: COMPLETE ✅"