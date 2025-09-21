/**
 * Concept-Proposition Transformer for ldclabs/KIP Protocol
 * Transforms flat data structures to Concept-Proposition model
 */

export class ConceptPropositionTransformer {
  constructor(driver) {
    this.driver = driver;
  }

  /**
   * Transform UPSERT operation to Concept-Proposition model
   * @param {string} label - Legacy label (e.g., 'Task', 'Policy')
   * @param {Object} properties - Flat properties object
   * @returns {Object} Transformed result with Concept and Propositions
   */
  async transformUpsert(label, properties) {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      // Ensure name property exists
      if (!properties.name) {
        throw new Error('UPSERT requires a name property');
      }

      // Step 1: Create or update Concept
      const conceptQuery = `
        MERGE (c:Concept {name: $name})
        ON CREATE SET
          c.type = $type,
          c.id = randomUUID(),
          c.created = timestamp(),
          c._legacy = $label
        ON MATCH SET
          c.type = COALESCE(c.type, $type),
          c.updated = timestamp(),
          c._legacy = COALESCE(c._legacy, $label)
        RETURN c
      `;

      const conceptResult = await tx.run(conceptQuery, {
        name: properties.name,
        type: label,
        label: label
      });

      const concept = conceptResult.records[0].get('c').properties;

      // Step 2: Create Propositions for each property (except name)
      const propositions = [];

      for (const [key, value] of Object.entries(properties)) {
        if (key === 'name') continue;

        const propQuery = `
          MATCH (c:Concept {name: $conceptName})
          MERGE (c)-[:HAS_PROPOSITION]->(p:Proposition {
            predicate: $predicate,
            object: $object,
            _conceptName: $conceptName
          })
          ON CREATE SET
            p.id = randomUUID(),
            p.created = timestamp(),
            p.metadata = $metadata
          ON MATCH SET
            p.updated = timestamp(),
            p.metadata = p.metadata + $metadata
          RETURN p
        `;

        const propResult = await tx.run(propQuery, {
          conceptName: properties.name,
          predicate: key,
          object: String(value),
          metadata: {
            source: 'upsert',
            label: label,
            timestamp: new Date().toISOString()
          }
        });

        if (propResult.records.length > 0) {
          propositions.push(propResult.records[0].get('p').properties);
        }
      }

      await tx.commit();

      return {
        concept,
        propositions,
        _transformed: true
      };

    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Transform FIND query results to include Propositions
   * @param {string} label - Label to find
   * @param {Object} whereClause - WHERE conditions
   * @returns {Array} Concepts with their Propositions
   */
  async transformFind(label, whereClause) {
    const session = this.driver.session();

    try {
      // Build query based on where clause
      let query = `
        MATCH (c:Concept)
        WHERE c.type = $type OR c._legacy = $type
      `;

      const params = { type: label };

      // Add WHERE conditions
      if (whereClause && Object.keys(whereClause).length > 0) {
        for (const [field, value] of Object.entries(whereClause)) {
          if (field === 'name') {
            query += ` AND c.name = $name`;
            params.name = value;
          } else {
            // Search in Propositions
            query = `
              MATCH (c:Concept)-[:HAS_PROPOSITION]->(p:Proposition)
              WHERE (c.type = $type OR c._legacy = $type)
                AND p.predicate = $predicate
                AND p.object = $object
            `;
            params.predicate = field;
            params.object = String(value);
          }
        }
      }

      // Fetch Concepts with their Propositions
      query += `
        WITH DISTINCT c
        OPTIONAL MATCH (c)-[:HAS_PROPOSITION]->(p:Proposition)
        RETURN c, collect(p) as propositions
        LIMIT 100
      `;

      const result = await session.run(query, params);

      // Transform results to flat structure for backward compatibility
      return result.records.map(record => {
        const concept = record.get('c').properties;
        const props = record.get('propositions')
          .filter(p => p)
          .map(p => p.properties);

        // Flatten for legacy compatibility
        const flattened = { name: concept.name };

        for (const prop of props) {
          if (prop.predicate && prop.object) {
            flattened[prop.predicate] = prop.object;
          }
        }

        // Include metadata
        flattened._concept = concept;
        flattened._propositions = props;

        return flattened;
      });

    } finally {
      await session.close();
    }
  }

  /**
   * Transform legacy node to Concept-Proposition model
   * @param {Object} node - Legacy node from Neo4j
   * @returns {Object} Transformed Concept with Propositions
   */
  async migrateNode(node) {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      const nodeId = node.identity;
      const labels = node.labels;
      const properties = node.properties;

      // Create Concept
      const conceptQuery = `
        MATCH (n) WHERE ID(n) = $nodeId
        SET n:Concept,
            n.type = COALESCE(n.type, $type),
            n._migrated = timestamp(),
            n._originalLabels = $labels
        RETURN n as concept
      `;

      const conceptResult = await tx.run(conceptQuery, {
        nodeId: nodeId.toNumber(),
        type: labels[0] || 'Unknown',
        labels: labels
      });

      const concept = conceptResult.records[0].get('concept').properties;

      // Create Propositions from properties
      const propositions = [];

      for (const [key, value] of Object.entries(properties)) {
        if (['name', 'type', 'id', '_migrated', '_originalLabels'].includes(key)) {
          continue;
        }

        const propQuery = `
          MATCH (c:Concept) WHERE ID(c) = $nodeId
          CREATE (p:Proposition {
            id: randomUUID(),
            predicate: $predicate,
            object: $object,
            created: timestamp(),
            _source: 'migration'
          })
          CREATE (c)-[:HAS_PROPOSITION]->(p)
          RETURN p
        `;

        const propResult = await tx.run(propQuery, {
          nodeId: nodeId.toNumber(),
          predicate: key,
          object: String(value)
        });

        if (propResult.records.length > 0) {
          propositions.push(propResult.records[0].get('p').properties);
        }
      }

      await tx.commit();

      return {
        concept,
        propositions,
        _migrated: true
      };

    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Validate if a query uses Concept-Proposition model
   * @param {string} query - Query string
   * @returns {boolean} True if using new model
   */
  isConceptPropositionQuery(query) {
    const patterns = [
      /FIND\s+Concept/i,
      /MATCH.*Concept/i,
      /Proposition/i,
      /HAS_PROPOSITION/i
    ];

    return patterns.some(pattern => pattern.test(query));
  }

  /**
   * Convert legacy query to Concept-Proposition query
   * @param {string} query - Legacy query string
   * @returns {string} Converted query
   */
  convertToConceptQuery(query) {
    // FIND Task WHERE name = 'test'
    // → FIND Concept WHERE type = 'Task' AND name = 'test'

    let converted = query;

    // Replace FIND <Label> with FIND Concept WHERE type = '<Label>'
    converted = converted.replace(
      /FIND\s+(\w+)\s+WHERE/gi,
      "FIND Concept WHERE type = '$1' AND"
    );

    // Handle UPSERT
    converted = converted.replace(
      /UPSERT\s+(\w+)/gi,
      "UPSERT Concept {type: '$1'} "
    );

    return converted;
  }
}

export default ConceptPropositionTransformer;