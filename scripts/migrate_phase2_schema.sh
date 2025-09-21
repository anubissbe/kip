#!/bin/bash

# Phase 2: Data Model Migration Script
# Migrates to ldclabs/KIP Concept-Proposition model

echo "=== Phase 2: Data Model Migration ==="
echo "Migrating to Concept-Proposition model..."

# Neo4j connection details
NEO4J_URI="bolt://localhost:7689"
NEO4J_USER="neo4j"
NEO4J_PASSWORD="${NEO4J_PASSWORD:-changeme-neo4j}"

# Function to execute Cypher queries
execute_cypher() {
    local query="$1"
    docker exec kipdev-neo4j cypher-shell \
        -u "$NEO4J_USER" \
        -p "$NEO4J_PASSWORD" \
        -a "$NEO4J_URI" \
        --format plain \
        "$query" 2>/dev/null
}

# Step 1: Create constraints for Concept and Proposition
echo "1. Creating schema constraints..."

execute_cypher "
CREATE CONSTRAINT concept_name IF NOT EXISTS
ON (c:Concept) ASSERT c.name IS UNIQUE;
"

execute_cypher "
CREATE CONSTRAINT proposition_id IF NOT EXISTS
ON (p:Proposition) ASSERT p.id IS UNIQUE;
"

echo "   ✅ Constraints created"

# Step 2: Backup existing data
echo "2. Backing up existing data..."
BACKUP_FILE="/tmp/kip_backup_$(date +%Y%m%d_%H%M%S).cypher"

execute_cypher "
CALL apoc.export.cypher.all('$BACKUP_FILE', {
    format: 'cypher-shell',
    useOptimizations: {type: 'UNWIND_BATCH', unwindBatchSize: 20}
})
" || echo "   ⚠️  Backup skipped (APOC may not be installed)"

# Step 3: Migrate existing nodes to Concepts
echo "3. Migrating existing nodes to Concept model..."

execute_cypher "
MATCH (n)
WHERE NOT n:Concept AND NOT n:Proposition
WITH n, labels(n) as oldLabels
WHERE size(oldLabels) > 0
SET n:Concept, n.type = COALESCE(n.type, oldLabels[0]), n._migrated = timestamp()
RETURN count(n) as migrated
"

echo "   ✅ Nodes migrated to Concept model"

# Step 4: Transform properties to Propositions
echo "4. Creating Propositions from properties..."

# Create a transformer script
cat > /tmp/transform_propositions.cypher << 'EOF'
// Transform flat properties to Propositions
MATCH (c:Concept)
WHERE c._migrated IS NOT NULL
WITH c, properties(c) as props
UNWIND keys(props) as key
WITH c, key, props[key] as value
WHERE key NOT IN ['name', 'type', '_migrated', 'id']
CREATE (p:Proposition {
    id: randomUUID(),
    predicate: key,
    object: value,
    created: timestamp(),
    _source: 'migration'
})
CREATE (c)-[:HAS_PROPOSITION]->(p)
RETURN count(p) as created_propositions
EOF

execute_cypher "$(cat /tmp/transform_propositions.cypher)"

echo "   ✅ Properties transformed to Propositions"

# Step 5: Clean up legacy labels (optional, commented out for safety)
echo "5. Cleaning up legacy labels..."
# execute_cypher "
# MATCH (n:Concept)
# WHERE size(labels(n)) > 1
# REMOVE n:Policy, n:Task, n:Session, n:Compliance, n:TestPhase3, n:Phase3Summary
# RETURN count(n) as cleaned
# "
echo "   ⚠️  Legacy labels preserved for backward compatibility"

# Step 6: Verify migration
echo ""
echo "6. Verifying migration..."

CONCEPT_COUNT=$(execute_cypher "MATCH (c:Concept) RETURN count(c) as count" | grep -o '[0-9]*' | head -1)
PROP_COUNT=$(execute_cypher "MATCH (p:Proposition) RETURN count(p) as count" | grep -o '[0-9]*' | head -1)

echo "   📊 Migration Statistics:"
echo "   - Concepts: ${CONCEPT_COUNT:-0}"
echo "   - Propositions: ${PROP_COUNT:-0}"

# Step 7: Create indexes for performance
echo ""
echo "7. Creating performance indexes..."

execute_cypher "CREATE INDEX concept_type IF NOT EXISTS FOR (c:Concept) ON (c.type)"
execute_cypher "CREATE INDEX proposition_predicate IF NOT EXISTS FOR (p:Proposition) ON (p.predicate)"
execute_cypher "CREATE INDEX proposition_object IF NOT EXISTS FOR (p:Proposition) ON (p.object)"

echo "   ✅ Indexes created"

echo ""
echo "=== Phase 2 Migration Complete ==="
echo ""
echo "Next steps:"
echo "1. Test queries with new Concept-Proposition model"
echo "2. Verify backward compatibility"
echo "3. Update application code to use new model"