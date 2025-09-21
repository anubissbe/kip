/**
 * Cognitive Interface for ldclabs/KIP Protocol
 * Enables bidirectional communication between Claude and KIP
 */

import neo4j from "neo4j-driver";

export class CognitiveInterface {
  constructor(driver) {
    this.driver = driver;
    this.sessionContext = new Map();
    this.queryHistory = [];
  }

  /**
   * Request clarification from Claude for ambiguous queries
   * @param {string} query - The ambiguous query
   * @param {Object} context - Current context
   * @returns {Object} Clarification response
   */
  async requestClarification(query, context = {}) {
    const session = this.driver.session();

    try {
      // Store the clarification request in the graph
      const cypher = `
        CREATE (c:ClarificationRequest {
          id: randomUUID(),
          query: $query,
          context: $context,
          timestamp: timestamp(),
          status: 'pending'
        })
        RETURN c
      `;

      const result = await session.run(cypher, {
        query,
        context: JSON.stringify(context)
      });

      const clarificationNode = result.records[0].get('c').properties;

      // Generate clarification prompts based on query patterns
      const suggestions = this.generateClarificationPrompts(query);

      return {
        requestId: clarificationNode.id,
        originalQuery: query,
        suggestions,
        promptForUser: this.formatClarificationPrompt(query, suggestions),
        _cognitive: true
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Generate query suggestions based on context
   * @param {Object} context - Current conversation context
   * @returns {Array} Suggested queries
   */
  async suggestQueries(context = {}) {
    const session = this.driver.session();

    try {
      // Analyze recent queries to identify patterns
      const recentQueries = `
        MATCH (q:QueryLog)
        WHERE q.timestamp > timestamp() - 3600000  // Last hour
        RETURN q.query as query, q.result as result
        ORDER BY q.timestamp DESC
        LIMIT 10
      `;

      const recentResults = await session.run(recentQueries);
      const patterns = this.analyzeQueryPatterns(recentResults.records);

      // Get related concepts from the graph
      const relatedConcepts = await this.findRelatedConcepts(context);

      // Generate intelligent suggestions
      const suggestions = this.generateQuerySuggestions(patterns, relatedConcepts);

      return {
        suggestions,
        basedOn: {
          recentPatterns: patterns,
          relatedConcepts: relatedConcepts
        },
        _cognitive: true
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Learn from user feedback on suggestions
   * @param {string} suggestionId - ID of the suggestion
   * @param {boolean} wasUseful - Whether the suggestion was useful
   * @param {string} feedback - Optional feedback text
   */
  async learnFromFeedback(suggestionId, wasUseful, feedback = null) {
    const session = this.driver.session();

    try {
      const cypher = `
        MERGE (f:Feedback {suggestionId: $suggestionId})
        SET f.wasUseful = $wasUseful,
            f.feedback = $feedback,
            f.timestamp = timestamp()
        WITH f
        MATCH (s:Suggestion {id: $suggestionId})
        CREATE (s)-[:RECEIVED_FEEDBACK]->(f)
        RETURN f
      `;

      await session.run(cypher, {
        suggestionId,
        wasUseful,
        feedback
      });

      // Update learning model based on feedback
      await this.updateLearningModel(suggestionId, wasUseful);

      return {
        recorded: true,
        suggestionId,
        _cognitive: true
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Analyze context to predict next likely query
   * @param {Array} queryHistory - Recent query history
   * @returns {Object} Prediction with confidence
   */
  async predictNextQuery(queryHistory = []) {
    if (queryHistory.length === 0) {
      queryHistory = this.queryHistory.slice(-5);
    }

    // Identify patterns in query sequence
    const patterns = this.identifySequencePatterns(queryHistory);

    // Match patterns against known workflows
    const workflows = await this.matchWorkflowPatterns(patterns);

    // Generate predictions based on workflows
    const predictions = workflows.map(workflow => ({
      query: workflow.nextStep,
      confidence: workflow.confidence,
      reasoning: workflow.reasoning
    }));

    return {
      predictions: predictions.slice(0, 3),
      basedOnHistory: queryHistory,
      _cognitive: true
    };
  }

  /**
   * Create a cognitive session for continuous interaction
   * @param {string} sessionId - Unique session identifier
   * @returns {Object} Session details
   */
  async createCognitiveSession(sessionId) {
    const session = this.driver.session();

    try {
      const cypher = `
        CREATE (s:CognitiveSession {
          id: $sessionId,
          created: timestamp(),
          active: true,
          metadata: $metadata
        })
        RETURN s
      `;

      const result = await session.run(cypher, {
        sessionId,
        metadata: JSON.stringify({
          version: '1.0',
          protocol: 'ldclabs/KIP',
          features: ['clarification', 'suggestion', 'learning']
        })
      });

      const cogSession = result.records[0].get('s').properties;

      // Initialize session context
      this.sessionContext.set(sessionId, {
        created: new Date(),
        queries: [],
        suggestions: [],
        clarifications: []
      });

      return {
        sessionId: cogSession.id,
        created: cogSession.created,
        active: true,
        _cognitive: true
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Helper: Generate clarification prompts
   */
  generateClarificationPrompts(query) {
    const prompts = [];

    // Check for ambiguous terms
    if (query.includes('recent') || query.includes('latest')) {
      prompts.push({
        type: 'temporal',
        question: 'What time period should be considered?',
        options: ['Last hour', 'Last 24 hours', 'Last week', 'All time']
      });
    }

    // Check for missing context
    if (!query.includes('WHERE') && query.startsWith('FIND')) {
      prompts.push({
        type: 'filter',
        question: 'Would you like to add any filters?',
        suggestion: 'Add WHERE clause with specific conditions'
      });
    }

    // Check for vague references
    if (query.includes('this') || query.includes('that')) {
      prompts.push({
        type: 'reference',
        question: 'What does "this" or "that" refer to?',
        suggestion: 'Specify the exact concept or entity'
      });
    }

    return prompts;
  }

  /**
   * Helper: Format clarification prompt for user
   */
  formatClarificationPrompt(query, suggestions) {
    let prompt = `I need clarification on: "${query}"\n\n`;

    suggestions.forEach((s, i) => {
      prompt += `${i + 1}. ${s.question}\n`;
      if (s.options) {
        s.options.forEach((opt, j) => {
          prompt += `   ${String.fromCharCode(97 + j)}) ${opt}\n`;
        });
      } else if (s.suggestion) {
        prompt += `   Suggestion: ${s.suggestion}\n`;
      }
      prompt += '\n';
    });

    return prompt;
  }

  /**
   * Helper: Analyze query patterns
   */
  analyzeQueryPatterns(records) {
    const patterns = {
      concepts: new Map(),
      predicates: new Set(),
      sequences: []
    };

    records.forEach(record => {
      const query = record.get('query');

      // Extract concepts (capitalized words after FIND/WHERE)
      const conceptMatches = query.match(/(?:FIND|WHERE)\s+(\w+)/gi) || [];
      conceptMatches.forEach(match => {
        const concept = match.split(/\s+/)[1];
        patterns.concepts.set(concept, (patterns.concepts.get(concept) || 0) + 1);
      });

      // Extract predicates
      const predicateMatches = query.match(/(\w+)\s*=\s*/g) || [];
      predicateMatches.forEach(match => {
        patterns.predicates.add(match.replace(/\s*=\s*/, ''));
      });
    });

    return patterns;
  }

  /**
   * Helper: Find related concepts in the graph
   */
  async findRelatedConcepts(context) {
    const session = this.driver.session();

    try {
      // If context has a current concept, find related ones
      if (context.currentConcept) {
        const cypher = `
          MATCH (c:Concept {name: $name})-[:HAS_PROPOSITION]->(p:Proposition)
          OPTIONAL MATCH (p)-[:REFERENCES]->(related:Concept)
          RETURN DISTINCT related.name as relatedConcept
          LIMIT 10
        `;

        const result = await session.run(cypher, {
          name: context.currentConcept
        });

        return result.records
          .map(r => r.get('relatedConcept'))
          .filter(c => c !== null);
      }

      return [];
    } finally {
      await session.close();
    }
  }

  /**
   * Helper: Generate query suggestions
   */
  generateQuerySuggestions(patterns, relatedConcepts) {
    const suggestions = [];

    // Suggest queries for frequently accessed concepts
    if (patterns.concepts.size > 0) {
      const topConcepts = Array.from(patterns.concepts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3);

      topConcepts.forEach(([concept, count]) => {
        suggestions.push({
          query: `FIND ${concept} WHERE status = 'active'`,
          reason: `Frequently accessed concept (${count} times)`,
          confidence: 0.7 + (count / 10) * 0.3
        });
      });
    }

    // Suggest queries for related concepts
    relatedConcepts.forEach(concept => {
      suggestions.push({
        query: `FIND Concept WHERE name = '${concept}'`,
        reason: 'Related to current context',
        confidence: 0.6
      });
    });

    // Add some intelligent combinations
    if (patterns.predicates.size > 0) {
      const predicateArray = Array.from(patterns.predicates);
      suggestions.push({
        query: `FIND Proposition WHERE predicate = '${predicateArray[0]}'`,
        reason: 'Common predicate in recent queries',
        confidence: 0.5
      });
    }

    return suggestions;
  }

  /**
   * Helper: Identify sequence patterns
   */
  identifySequencePatterns(queryHistory) {
    const patterns = [];

    for (let i = 0; i < queryHistory.length - 1; i++) {
      const current = queryHistory[i];
      const next = queryHistory[i + 1];

      // Check for common sequences
      if (current.includes('UPSERT') && next.includes('FIND')) {
        patterns.push({
          type: 'create-then-query',
          confidence: 0.8
        });
      }

      if (current.includes('FIND') && next.includes('FIND')) {
        patterns.push({
          type: 'exploration',
          confidence: 0.7
        });
      }
    }

    return patterns;
  }

  /**
   * Helper: Match workflow patterns
   */
  async matchWorkflowPatterns(patterns) {
    const workflows = [];

    patterns.forEach(pattern => {
      if (pattern.type === 'create-then-query') {
        workflows.push({
          nextStep: 'FIND Concept WHERE type = "recent"',
          confidence: pattern.confidence,
          reasoning: 'After creation, users often verify the new data'
        });
      }

      if (pattern.type === 'exploration') {
        workflows.push({
          nextStep: 'FIND Proposition WHERE subject = "current"',
          confidence: pattern.confidence * 0.9,
          reasoning: 'Exploration often leads to examining relationships'
        });
      }
    });

    return workflows;
  }

  /**
   * Helper: Update learning model based on feedback
   */
  async updateLearningModel(suggestionId, wasUseful) {
    const session = this.driver.session();

    try {
      // Update suggestion effectiveness score
      const cypher = `
        MATCH (s:Suggestion {id: $suggestionId})
        SET s.effectivenessScore = COALESCE(s.effectivenessScore, 0.5) + $adjustment,
            s.feedbackCount = COALESCE(s.feedbackCount, 0) + 1
        RETURN s
      `;

      const adjustment = wasUseful ? 0.1 : -0.1;

      await session.run(cypher, {
        suggestionId,
        adjustment
      });
    } finally {
      await session.close();
    }
  }
}

export default CognitiveInterface;