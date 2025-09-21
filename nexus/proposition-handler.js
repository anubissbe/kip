/**
 * Proposition Handler for ldclabs/KIP Protocol
 * Manages Concept-Proposition relationships
 */

export class PropositionHandler {
  constructor(driver) {
    this.driver = driver;
  }

  /**
   * Create a Proposition linking two Concepts
   * @param {Object} proposition - Proposition data
   * @returns {Object} Created proposition with relationships
   */
  async createProposition(proposition) {
    const session = this.driver.session();

    try {
      const { subject, predicate, object, metadata = {} } = proposition;

      // Ensure subject and object Concepts exist
      const cypher = `
        // Ensure subject Concept exists
        MERGE (subj:Concept {name: $subject})
        ON CREATE SET subj.created = timestamp()

        // Ensure object Concept exists (if it's a concept reference)
        FOREACH (o IN CASE WHEN $isObjectConcept THEN [1] ELSE [] END |
          MERGE (obj:Concept {name: $object})
          ON CREATE SET obj.created = timestamp()
        )

        // Create Proposition node
        CREATE (prop:Proposition {
          id: randomUUID(),
          predicate: $predicate,
          object: $object,
          created: timestamp()
        })
        SET prop += $metadata

        // Create relationships
        CREATE (subj)-[:HAS_PROPOSITION]->(prop)

        // Link to object Concept if applicable
        FOREACH (o IN CASE WHEN $isObjectConcept THEN [1] ELSE [] END |
          MERGE (obj:Concept {name: $object})
          CREATE (prop)-[:REFERENCES]->(obj)
        )

        RETURN prop, subj,
               CASE WHEN $isObjectConcept
                    THEN [(prop)-[:REFERENCES]->(obj:Concept) | obj][0]
                    ELSE null
               END as objConcept
      `;

      const params = {
        subject,
        predicate,
        object,
        metadata,
        isObjectConcept: this.isConceptReference(object)
      };

      const result = await session.run(cypher, params);

      if (result.records.length > 0) {
        const record = result.records[0];
        return {
          proposition: record.get('prop').properties,
          subject: record.get('subj').properties,
          objectConcept: record.get('objConcept')?.properties || null
        };
      }

      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Query Propositions for a Concept
   * @param {string} conceptName - Name of the Concept
   * @param {string} predicate - Optional predicate filter
   * @returns {Array} Propositions related to the Concept
   */
  async getPropositions(conceptName, predicate = null) {
    const session = this.driver.session();

    try {
      let cypher = `
        MATCH (c:Concept {name: $conceptName})-[:HAS_PROPOSITION]->(prop:Proposition)
        ${predicate ? 'WHERE prop.predicate = $predicate' : ''}
        OPTIONAL MATCH (prop)-[:REFERENCES]->(ref:Concept)
        RETURN prop, ref
        ORDER BY prop.created DESC
        LIMIT 100
      `;

      const params = { conceptName };
      if (predicate) params.predicate = predicate;

      const result = await session.run(cypher, params);

      return result.records.map(record => ({
        proposition: record.get('prop').properties,
        referencedConcept: record.get('ref')?.properties || null
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Find Concepts by Proposition
   * @param {string} predicate - Predicate to search for
   * @param {string} object - Object value to match
   * @returns {Array} Concepts that have this proposition
   */
  async findConceptsByProposition(predicate, object) {
    const session = this.driver.session();

    try {
      const cypher = `
        MATCH (c:Concept)-[:HAS_PROPOSITION]->(prop:Proposition)
        WHERE prop.predicate = $predicate
          AND prop.object = $object
        RETURN DISTINCT c
        LIMIT 100
      `;

      const result = await session.run(cypher, { predicate, object });

      return result.records.map(record => record.get('c').properties);
    } finally {
      await session.close();
    }
  }

  /**
   * Create a chain of Propositions (for complex relationships)
   * @param {Array} chain - Array of proposition definitions
   * @returns {Object} Created chain with all relationships
   */
  async createPropositionChain(chain) {
    const session = this.driver.session();
    const tx = session.beginTransaction();

    try {
      const results = [];
      let previousObject = null;

      for (const link of chain) {
        // Use previous object as subject if chaining
        const subject = link.subject || previousObject;

        if (!subject) {
          throw new Error('Chain link missing subject');
        }

        const cypher = `
          MERGE (subj:Concept {name: $subject})
          CREATE (prop:Proposition {
            id: randomUUID(),
            predicate: $predicate,
            object: $object,
            chainIndex: $index,
            created: timestamp()
          })
          CREATE (subj)-[:HAS_PROPOSITION]->(prop)
          RETURN prop, subj
        `;

        const result = await tx.run(cypher, {
          subject,
          predicate: link.predicate,
          object: link.object,
          index: results.length
        });

        if (result.records.length > 0) {
          results.push({
            proposition: result.records[0].get('prop').properties,
            subject: result.records[0].get('subj').properties
          });
          previousObject = link.object;
        }
      }

      await tx.commit();
      return { chain: results };
    } catch (error) {
      await tx.rollback();
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Delete a Proposition
   * @param {string} propositionId - ID of the Proposition to delete
   * @returns {boolean} Success status
   */
  async deleteProposition(propositionId) {
    const session = this.driver.session();

    try {
      const cypher = `
        MATCH (prop:Proposition {id: $propositionId})
        DETACH DELETE prop
        RETURN count(prop) as deleted
      `;

      const result = await session.run(cypher, { propositionId });

      return result.records[0].get('deleted') > 0;
    } finally {
      await session.close();
    }
  }

  /**
   * Check if a value is a reference to another Concept
   * @param {string} value - Value to check
   * @returns {boolean} True if it's a Concept reference
   */
  isConceptReference(value) {
    // Simple heuristic: if it starts with @ or matches Concept naming pattern
    return typeof value === 'string' && (
      value.startsWith('@') ||
      /^[A-Z][a-zA-Z0-9]+$/.test(value)
    );
  }

  /**
   * Get the relationship graph for a Concept
   * @param {string} conceptName - Name of the Concept
   * @param {number} depth - How many levels to traverse
   * @returns {Object} Graph structure
   */
  async getConceptGraph(conceptName, depth = 2) {
    const session = this.driver.session();

    try {
      const cypher = `
        MATCH path = (c:Concept {name: $conceptName})-[:HAS_PROPOSITION*1..${depth}]->()
        WITH c, collect(path) as paths
        MATCH (c)-[:HAS_PROPOSITION]->(prop:Proposition)
        OPTIONAL MATCH (prop)-[:REFERENCES]->(ref:Concept)
        RETURN c, collect(DISTINCT prop) as propositions, collect(DISTINCT ref) as references
      `;

      const result = await session.run(cypher, { conceptName });

      if (result.records.length > 0) {
        const record = result.records[0];
        return {
          concept: record.get('c').properties,
          propositions: record.get('propositions').map(p => p.properties),
          references: record.get('references').filter(r => r).map(r => r.properties)
        };
      }

      return null;
    } finally {
      await session.close();
    }
  }

  /**
   * Transform flat properties to Propositions (migration helper)
   * @param {string} conceptName - Name of the Concept
   * @param {Object} properties - Flat properties to convert
   * @returns {Array} Created propositions
   */
  async transformToPropositions(conceptName, properties) {
    const propositions = [];

    for (const [key, value] of Object.entries(properties)) {
      if (key !== 'name' && key !== 'type' && key !== '_legacy') {
        const prop = await this.createProposition({
          subject: conceptName,
          predicate: key,
          object: value,
          metadata: {
            migrated: true,
            originalProperty: true
          }
        });
        propositions.push(prop);
      }
    }

    return propositions;
  }
}

/**
 * Parse Proposition syntax from KQL
 * Examples:
 * - "CREATE PROPOSITION Task.status = 'pending'"
 * - "LINK ProjectA CONTAINS TaskB"
 */
export function parsePropositionSyntax(query) {
  // CREATE PROPOSITION pattern
  const createMatch = query.match(/CREATE\s+PROPOSITION\s+(\w+)\.(\w+)\s*=\s*'([^']+)'/i);
  if (createMatch) {
    return {
      action: 'create',
      subject: createMatch[1],
      predicate: createMatch[2],
      object: createMatch[3]
    };
  }

  // LINK pattern
  const linkMatch = query.match(/LINK\s+(\w+)\s+(\w+)\s+(\w+)/i);
  if (linkMatch) {
    return {
      action: 'link',
      subject: linkMatch[1],
      predicate: linkMatch[2],
      object: linkMatch[3]
    };
  }

  return null;
}