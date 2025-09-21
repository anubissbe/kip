/**
 * Metadata Tracker for ldclabs/KIP Protocol
 * Tracks knowledge provenance, chain-of-thought, and reasoning
 */

import crypto from 'crypto';

export class MetadataTracker {
  constructor(driver) {
    this.driver = driver;
    this.sessionId = this.generateSessionId();
    this.chainOfThought = [];
    this.confidenceModel = new Map();
  }

  /**
   * Track a query execution with full metadata
   * @param {string} query - The executed query
   * @param {Object} result - Query result
   * @param {Object} context - Execution context
   * @returns {Object} Tracked metadata
   */
  async trackQuery(query, result, context = {}) {
    const session = this.driver.session();

    try {
      const metadata = {
        id: this.generateTrackingId(),
        timestamp: new Date().toISOString(),
        query,
        resultSummary: this.summarizeResult(result),
        session: this.sessionId,
        reasoning: await this.captureReasoning(query, context),
        confidence: this.calculateConfidence(result),
        provenance: await this.establishProvenance(query, context),
        performance: {
          executionTime: context.executionTime || null,
          resourceUsage: context.resourceUsage || null
        }
      };

      // Store in graph
      const cypher = `
        CREATE (m:QueryMetadata {
          id: $id,
          timestamp: timestamp(),
          sessionId: $sessionId,
          query: $query,
          confidence: $confidence,
          reasoning: $reasoning,
          provenance: $provenance,
          resultCount: $resultCount
        })
        RETURN m
      `;

      await session.run(cypher, {
        id: metadata.id,
        sessionId: metadata.session,
        query: metadata.query,
        confidence: metadata.confidence,
        reasoning: JSON.stringify(metadata.reasoning),
        provenance: JSON.stringify(metadata.provenance),
        resultCount: result?.length || 0
      });

      // Update chain of thought
      this.chainOfThought.push({
        step: this.chainOfThought.length + 1,
        query,
        reasoning: metadata.reasoning,
        confidence: metadata.confidence
      });

      return metadata;
    } finally {
      await session.close();
    }
  }

  /**
   * Track the provenance of a piece of knowledge
   * @param {string} conceptName - Name of the concept
   * @param {Object} source - Source information
   * @returns {Object} Provenance record
   */
  async trackProvenance(conceptName, source) {
    const session = this.driver.session();

    try {
      const provenance = {
        id: this.generateTrackingId(),
        concept: conceptName,
        source: {
          type: source.type || 'manual',
          origin: source.origin || 'user',
          timestamp: source.timestamp || new Date().toISOString(),
          confidence: source.confidence || 1.0
        },
        lineage: await this.traceLineage(conceptName),
        verificationStatus: 'pending'
      };

      // Create provenance node
      const cypher = `
        MATCH (c:Concept {name: $conceptName})
        CREATE (p:Provenance {
          id: $id,
          sourceType: $sourceType,
          origin: $origin,
          timestamp: timestamp(),
          confidence: $confidence
        })
        CREATE (c)-[:HAS_PROVENANCE]->(p)
        RETURN p
      `;

      await session.run(cypher, {
        conceptName,
        id: provenance.id,
        sourceType: provenance.source.type,
        origin: provenance.source.origin,
        confidence: provenance.source.confidence
      });

      return provenance;
    } finally {
      await session.close();
    }
  }

  /**
   * Capture the chain of thought for a reasoning process
   * @param {Array} steps - Array of reasoning steps
   * @returns {Object} Chain of thought record
   */
  async captureChainOfThought(steps) {
    const session = this.driver.session();

    try {
      const chain = {
        id: this.generateTrackingId(),
        sessionId: this.sessionId,
        steps: steps.map((step, index) => ({
          order: index + 1,
          description: step.description,
          input: step.input,
          output: step.output,
          confidence: step.confidence || this.calculateStepConfidence(step),
          duration: step.duration || null
        })),
        conclusion: this.deriveConclusion(steps),
        totalConfidence: this.calculateChainConfidence(steps)
      };

      // Store chain in graph
      const cypher = `
        CREATE (c:ChainOfThought {
          id: $id,
          sessionId: $sessionId,
          timestamp: timestamp(),
          stepCount: $stepCount,
          conclusion: $conclusion,
          confidence: $confidence
        })
        WITH c
        UNWIND $steps as step
        CREATE (s:ThoughtStep {
          order: step.order,
          description: step.description,
          confidence: step.confidence
        })
        CREATE (c)-[:HAS_STEP]->(s)
        RETURN c
      `;

      await session.run(cypher, {
        id: chain.id,
        sessionId: chain.sessionId,
        stepCount: chain.steps.length,
        conclusion: chain.conclusion,
        confidence: chain.totalConfidence,
        steps: chain.steps
      });

      return chain;
    } finally {
      await session.close();
    }
  }

  /**
   * Track learning from interactions
   * @param {string} pattern - Identified pattern
   * @param {Object} outcome - Outcome of applying the pattern
   * @returns {Object} Learning record
   */
  async trackLearning(pattern, outcome) {
    const session = this.driver.session();

    try {
      const learning = {
        id: this.generateTrackingId(),
        pattern,
        outcome: {
          success: outcome.success,
          confidence: outcome.confidence,
          feedback: outcome.feedback
        },
        timestamp: new Date().toISOString(),
        applicationCount: 1
      };

      // Store or update learning pattern
      const cypher = `
        MERGE (l:LearningPattern {pattern: $pattern})
        ON CREATE SET
          l.id = $id,
          l.firstSeen = timestamp(),
          l.successCount = CASE WHEN $success THEN 1 ELSE 0 END,
          l.failureCount = CASE WHEN NOT $success THEN 1 ELSE 0 END,
          l.totalCount = 1
        ON MATCH SET
          l.lastSeen = timestamp(),
          l.successCount = l.successCount + CASE WHEN $success THEN 1 ELSE 0 END,
          l.failureCount = l.failureCount + CASE WHEN NOT $success THEN 1 ELSE 0 END,
          l.totalCount = l.totalCount + 1
        RETURN l
      `;

      const result = await session.run(cypher, {
        pattern,
        id: learning.id,
        success: learning.outcome.success
      });

      // Update confidence model
      this.updateConfidenceModel(pattern, outcome);

      return learning;
    } finally {
      await session.close();
    }
  }

  /**
   * Get reasoning transparency report
   * @param {string} queryId - ID of the query to explain
   * @returns {Object} Transparency report
   */
  async getTransparencyReport(queryId) {
    const session = this.driver.session();

    try {
      // Fetch all metadata for the query
      const cypher = `
        MATCH (m:QueryMetadata {id: $queryId})
        OPTIONAL MATCH (m)-[:PART_OF]->(c:ChainOfThought)
        OPTIONAL MATCH (c)-[:HAS_STEP]->(s:ThoughtStep)
        RETURN m, c, collect(s) as steps
        ORDER BY s.order
      `;

      const result = await session.run(cypher, { queryId });

      if (result.records.length === 0) {
        return { error: 'Query metadata not found' };
      }

      const record = result.records[0];
      const metadata = record.get('m').properties;
      const chain = record.get('c')?.properties;
      const steps = record.get('steps');

      return {
        query: metadata.query,
        timestamp: metadata.timestamp,
        reasoning: JSON.parse(metadata.reasoning || '{}'),
        provenance: JSON.parse(metadata.provenance || '{}'),
        confidence: metadata.confidence,
        chainOfThought: chain ? {
          conclusion: chain.conclusion,
          steps: steps.map(s => s.properties)
        } : null,
        explanation: this.generateExplanation(metadata, chain, steps)
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Helper: Generate session ID
   */
  generateSessionId() {
    return `session_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }

  /**
   * Helper: Generate tracking ID
   */
  generateTrackingId() {
    return `track_${Date.now()}_${crypto.randomBytes(8).toString('hex')}`;
  }

  /**
   * Helper: Summarize query result
   */
  summarizeResult(result) {
    if (!result) return { count: 0, type: 'empty' };

    return {
      count: Array.isArray(result) ? result.length : 1,
      type: result.ok ? 'success' : 'failure',
      hasData: result.data ? true : false
    };
  }

  /**
   * Helper: Capture reasoning for a query
   */
  async captureReasoning(query, context) {
    const reasoning = {
      queryType: this.identifyQueryType(query),
      intent: this.inferIntent(query, context),
      assumptions: this.identifyAssumptions(query),
      strategy: this.determineStrategy(query)
    };

    return reasoning;
  }

  /**
   * Helper: Calculate confidence score
   */
  calculateConfidence(result) {
    let confidence = 0.5; // Base confidence

    // Adjust based on result
    if (result && result.ok) {
      confidence += 0.2;
    }

    if (result && result.data && result.data.length > 0) {
      confidence += 0.2;
    }

    // Check if result matches expected patterns
    if (this.matchesExpectedPattern(result)) {
      confidence += 0.1;
    }

    return Math.min(confidence, 1.0);
  }

  /**
   * Helper: Establish provenance
   */
  async establishProvenance(query, context) {
    return {
      source: context.source || 'direct_input',
      user: context.user || 'claude',
      session: this.sessionId,
      previousQueries: this.chainOfThought.slice(-3).map(c => c.query),
      derivedFrom: context.derivedFrom || null
    };
  }

  /**
   * Helper: Trace lineage of a concept
   */
  async traceLineage(conceptName) {
    const session = this.driver.session();

    try {
      const cypher = `
        MATCH path = (c:Concept {name: $conceptName})-[:DERIVED_FROM*0..3]->(origin:Concept)
        RETURN path
        LIMIT 5
      `;

      const result = await session.run(cypher, { conceptName });

      return result.records.map(record => {
        const path = record.get('path');
        return {
          length: path.length,
          nodes: path.nodes.map(n => n.properties.name)
        };
      });
    } finally {
      await session.close();
    }
  }

  /**
   * Helper: Calculate step confidence
   */
  calculateStepConfidence(step) {
    let confidence = 0.6; // Base step confidence

    if (step.output && step.output.success) {
      confidence += 0.2;
    }

    if (step.verified) {
      confidence += 0.2;
    }

    return confidence;
  }

  /**
   * Helper: Derive conclusion from steps
   */
  deriveConclusion(steps) {
    const lastStep = steps[steps.length - 1];
    return lastStep?.output?.conclusion || 'Process completed';
  }

  /**
   * Helper: Calculate chain confidence
   */
  calculateChainConfidence(steps) {
    if (steps.length === 0) return 0;

    const confidences = steps.map(s => s.confidence || 0.5);
    const average = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    // Penalize for inconsistencies
    const variance = this.calculateVariance(confidences);
    const penalty = variance > 0.2 ? 0.1 : 0;

    return Math.max(0, Math.min(1, average - penalty));
  }

  /**
   * Helper: Calculate variance
   */
  calculateVariance(values) {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(v => Math.pow(v - mean, 2));
    return Math.sqrt(squaredDiffs.reduce((a, b) => a + b, 0) / values.length);
  }

  /**
   * Helper: Update confidence model
   */
  updateConfidenceModel(pattern, outcome) {
    const current = this.confidenceModel.get(pattern) || { success: 0, total: 0 };

    current.total += 1;
    if (outcome.success) {
      current.success += 1;
    }

    current.confidence = current.success / current.total;
    this.confidenceModel.set(pattern, current);
  }

  /**
   * Helper: Generate human-readable explanation
   */
  generateExplanation(metadata, chain, steps) {
    let explanation = `Query executed: ${metadata.query}\n`;
    explanation += `Confidence: ${(metadata.confidence * 100).toFixed(1)}%\n\n`;

    if (chain) {
      explanation += 'Chain of Thought:\n';
      steps.forEach(step => {
        explanation += `  ${step.order}. ${step.description} (${(step.confidence * 100).toFixed(1)}%)\n`;
      });
      explanation += `\nConclusion: ${chain.conclusion}\n`;
    }

    return explanation;
  }

  /**
   * Helper: Identify query type
   */
  identifyQueryType(query) {
    if (query.startsWith('FIND')) return 'search';
    if (query.startsWith('UPSERT')) return 'create_or_update';
    if (query.startsWith('DELETE')) return 'delete';
    if (query.includes('CREATE')) return 'create';
    return 'unknown';
  }

  /**
   * Helper: Infer intent from query
   */
  inferIntent(query, context) {
    // Simple intent inference
    if (query.includes('status')) return 'check_status';
    if (query.includes('recent') || query.includes('latest')) return 'get_recent';
    if (query.includes('count') || query.includes('how many')) return 'count';
    if (context.previousQuery?.includes('UPSERT')) return 'verify_creation';
    return 'general_query';
  }

  /**
   * Helper: Identify assumptions
   */
  identifyAssumptions(query) {
    const assumptions = [];

    if (!query.includes('LIMIT')) {
      assumptions.push('Assuming default limit of 100 results');
    }

    if (query.includes('name =') && !query.includes('"')) {
      assumptions.push('Assuming exact match on name field');
    }

    return assumptions;
  }

  /**
   * Helper: Determine strategy
   */
  determineStrategy(query) {
    if (query.includes('WHERE') && query.includes('AND')) {
      return 'multi_filter';
    }
    if (query.includes('OPTIONAL')) {
      return 'flexible_match';
    }
    if (query.includes('UNION')) {
      return 'combined_results';
    }
    return 'simple_query';
  }

  /**
   * Helper: Check if result matches expected pattern
   */
  matchesExpectedPattern(result) {
    // Simple pattern matching
    return result && result.ok && typeof result.data !== 'undefined';
  }
}

export default MetadataTracker;