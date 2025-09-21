#!/bin/bash
# KIP HTTP Wrappers Test Suite
set -euo pipefail

echo "=== KIP HTTP Wrappers Test Suite ==="
echo

# Test 1: Basic connectivity
echo "[1/5] Testing KIP server connectivity..."
if curl -s http://localhost:8081/.well-known/ai-plugin.json | grep -q "KIP"; then
    echo "✅ KIP server responding"
else
    echo "❌ KIP server not responding"
    exit 1
fi

# Test 2: Wrapper availability
echo "[2/5] Testing wrapper scripts..."
for cmd in kip-query kip-upsert kip-find kip-header; do
    if command -v "$cmd" >/dev/null 2>&1; then
        echo "✅ $cmd available"
    else
        echo "❌ $cmd not found"
        exit 1
    fi
done

# Test 3: UPSERT operation
echo "[3/5] Testing UPSERT operation..."
RESULT=$(kip-upsert TestLabel "{name: 'test-item', value: 'test-value', timestamp: '$(date +%Y-%m-%d)'}")
if echo "$RESULT" | grep -q '"ok":\s*true'; then
    echo "✅ UPSERT working"
else
    echo "❌ UPSERT failed: $RESULT"
    exit 1
fi

# Test 4: FIND operation
echo "[4/5] Testing FIND operation..."
RESULT=$(kip-query "FIND TestLabel WHERE name = 'test-item'")
if echo "$RESULT" | grep -q '"ok":\s*true'; then
    echo "✅ FIND working"
    echo "   Found: $(echo "$RESULT" | jq -r '.data[0].name' 2>/dev/null || echo 'data')"
else
    echo "❌ FIND failed: $RESULT"
    exit 1
fi

# Test 5: Header restoration
echo "[5/5] Testing header restoration..."
if kip-header | grep -q "restored\|already present"; then
    echo "✅ Header restoration working"
else
    echo "❌ Header restoration failed"
    exit 1
fi

echo
echo "=== All Tests Passed! ==="
echo
echo "Available commands:"
echo "  kip-query 'FIND Label WHERE field = \"value\"'"
echo "  kip-upsert Label '{name: \"value\", field: \"data\"}'"
echo "  kip-header"
echo
echo "Example usage:"
echo "  kip-query 'FIND TestLabel WHERE name = \"test-item\"'"
echo "  kip-upsert Project '{name: \"MyProject\", type: \"kubernetes\"}'"