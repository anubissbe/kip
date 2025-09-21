/**
 * Semantic Indexing Engine for KIP Phase 7
 *
 * Advanced semantic capabilities:
 * - Vector embeddings for Concepts and Propositions
 * - Full-text search with Neo4j FULLTEXT indexes
 * - Semantic similarity matching and clustering
 * - Knowledge graph traversal optimization
 */

import { distance } from 'ml-distance';
import crypto from 'crypto';

export class SemanticIndexingEngine {
  constructor(driver, config = {}) {
    this.driver = driver;
    this.config = {
      embeddingDimensions: 384, // Standard sentence transformer size
      similarityThreshold: 0.7,
      maxSimilarResults: 10,
      clusterThreshold: 0.8,
      fulltextIndexes: ['concept_fulltext', 'proposition_fulltext'],
      ...config
    };
    this.embeddings = new Map(); // Cache for computed embeddings
    this.initialized = false;
  }

  /**
   * Initialize semantic indexes and constraints
   */
  async initialize() {
    if (this.initialized) return;

    const session = this.driver.session();
    try {
      // Create vector indexes for embeddings
      await session.run(`
        CREATE VECTOR INDEX concept_embeddings IF NOT EXISTS
        FOR (c:Concept) ON (c.embedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: ${this.config.embeddingDimensions},
          \`vector.similarity_function\`: 'cosine'
        }}
      `);

      await session.run(`
        CREATE VECTOR INDEX proposition_embeddings IF NOT EXISTS
        FOR (p:Proposition) ON (p.embedding)
        OPTIONS {indexConfig: {
          \`vector.dimensions\`: ${this.config.embeddingDimensions},
          \`vector.similarity_function\`: 'cosine'
        }}
      `);

      // Create fulltext indexes
      await session.run(`
        CREATE FULLTEXT INDEX concept_fulltext IF NOT EXISTS
        FOR (c:Concept) ON [c.name, c.description, c.content]
      `);

      await session.run(`
        CREATE FULLTEXT INDEX proposition_fulltext IF NOT EXISTS
        FOR (p:Proposition) ON [p.subject, p.predicate, p.object, p.text_content]
      `);

      // Create semantic relationship index
      await session.run(`
        CREATE INDEX semantic_similarity IF NOT EXISTS
        FOR ()-[r:SEMANTICALLY_SIMILAR]-() ON (r.similarity, r.type)
      `);

      // Create clustering indexes
      await session.run(`
        CREATE INDEX semantic_clusters IF NOT EXISTS
        FOR (c:Concept) ON (c.cluster_id, c.cluster_membership)
      `);

      this.initialized = true;
      console.log('✅ Semantic indexing engine initialized');
    } catch (error) {
      console.error('❌ Failed to initialize semantic indexing:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Generate semantic embedding for text content
   * This is a simplified implementation - in production, use actual embeddings service
   */
  generateEmbedding(text) {
    if (!text || typeof text !== 'string') {
      return new Array(this.config.embeddingDimensions).fill(0);
    }

    // Simple hash-based embedding simulation
    // In production, replace with actual transformer model or API call
    const hash = crypto.createHash('sha256').update(text.toLowerCase()).digest();
    const embedding = [];

    for (let i = 0; i < this.config.embeddingDimensions; i++) {
      const byte = hash[i % hash.length];
      embedding.push((byte / 255) * 2 - 1); // Normalize to [-1, 1]
    }

    // Add some semantic structure based on text features
    const words = text.toLowerCase().split(/\s+/);
    const wordCount = words.length;
    const avgWordLength = words.reduce((sum, word) => sum + word.length, 0) / words.length;

    // Inject semantic features into embedding
    if (embedding.length > 10) {
      embedding[0] = Math.tanh(wordCount / 10); // Text length signal
      embedding[1] = Math.tanh(avgWordLength / 8); // Complexity signal
      embedding[2] = words.includes('concept') ? 0.5 : -0.5; // Domain signal
      embedding[3] = words.includes('relationship') ? 0.5 : -0.5; // Relation signal
    }

    return embedding;
  }

  /**
   * Update embeddings for a concept
   */
  async updateConceptEmbedding(conceptId, name, description = '', content = '') {
    const session = this.driver.session();
    try {
      const textContent = [name, description, content].filter(Boolean).join(' ');
      const embedding = this.generateEmbedding(textContent);

      await session.run(`
        MATCH (c:Concept {id: $conceptId})
        SET c.embedding = $embedding,
            c.text_content = $textContent,
            c.embedding_updated = timestamp()
        RETURN c
      `, { conceptId, embedding, textContent });

      // Cache the embedding
      this.embeddings.set(conceptId, embedding);

      return embedding;
    } finally {
      await session.close();
    }
  }

  /**
   * Update embeddings for a proposition
   */
  async updatePropositionEmbedding(propositionId, subject, predicate, object, metadata = {}) {
    const session = this.driver.session();
    try {
      const textContent = `${subject} ${predicate} ${object}`;
      const embedding = this.generateEmbedding(textContent);

      await session.run(`
        MATCH (p:Proposition {id: $propositionId})
        SET p.embedding = $embedding,
            p.text_content = $textContent,
            p.embedding_updated = timestamp()
        RETURN p
      `, { propositionId, embedding, textContent });

      this.embeddings.set(propositionId, embedding);
      return embedding;
    } finally {
      await session.close();
    }
  }

  /**
   * Find semantically similar concepts using vector search
   */
  async findSimilarConcepts(conceptId, limit = 10, threshold = null) {
    const session = this.driver.session();
    try {
      const useThreshold = threshold || this.config.similarityThreshold;

      const result = await session.run(`
        MATCH (source:Concept {id: $conceptId})
        WHERE source.embedding IS NOT NULL
        CALL db.index.vector.queryNodes('concept_embeddings', $limit, source.embedding)
        YIELD node AS similar, score
        WHERE similar.id <> $conceptId AND score >= $threshold
        RETURN similar {
          .id, .name, .type, .description,
          similarity: score,
          created: similar.created,
          updated: similar.updated
        } AS concept
        ORDER BY score DESC
        LIMIT $limit
      `, { conceptId, limit, threshold: useThreshold });

      return result.records.map(record => record.get('concept'));
    } finally {
      await session.close();
    }
  }

  /**
   * Find semantically similar propositions
   */
  async findSimilarPropositions(propositionId, limit = 10, threshold = null) {
    const session = this.driver.session();
    try {
      const useThreshold = threshold || this.config.similarityThreshold;

      const result = await session.run(`
        MATCH (source:Proposition {id: $propositionId})
        WHERE source.embedding IS NOT NULL
        CALL db.index.vector.queryNodes('proposition_embeddings', $limit, source.embedding)
        YIELD node AS similar, score
        WHERE similar.id <> $propositionId AND score >= $threshold
        RETURN similar {
          .id, .subject, .predicate, .object, .confidence,
          similarity: score,
          created: similar.created
        } AS proposition
        ORDER BY score DESC
        LIMIT $limit
      `, { propositionId, limit, threshold: useThreshold });

      return result.records.map(record => record.get('proposition'));
    } finally {
      await session.close();
    }
  }

  /**
   * Perform semantic search across all concepts
   */
  async semanticSearch(query, limit = 10, threshold = null) {
    const session = this.driver.session();
    try {
      const queryEmbedding = this.generateEmbedding(query);
      const useThreshold = threshold || this.config.similarityThreshold;

      const result = await session.run(`
        CALL db.index.vector.queryNodes('concept_embeddings', $limit, $queryEmbedding)
        YIELD node AS concept, score
        WHERE score >= $threshold
        RETURN concept {
          .id, .name, .type, .description,
          similarity: score,
          created: concept.created,
          updated: concept.updated
        } AS result
        ORDER BY score DESC
        LIMIT $limit
      `, { queryEmbedding, limit, threshold: useThreshold });

      return result.records.map(record => record.get('result'));
    } finally {
      await session.close();
    }
  }

  /**
   * Full-text search with semantic enhancement
   */
  async fulltextSearch(query, type = 'concept', limit = 10) {
    const session = this.driver.session();
    try {
      const indexName = type === 'concept' ? 'concept_fulltext' : 'proposition_fulltext';

      // Perform fulltext search
      const fulltextResult = await session.run(`
        CALL db.index.fulltext.queryNodes($indexName, $query)
        YIELD node, score
        RETURN node {
          .id, .name, .type, .description, .subject, .predicate, .object,
          fulltext_score: score
        } AS result
        ORDER BY score DESC
        LIMIT $limit
      `, { indexName, query, limit });

      const fulltextResults = fulltextResult.records.map(record => record.get('result'));

      // Enhance with semantic similarity if we have results
      if (fulltextResults.length > 0) {
        const queryEmbedding = this.generateEmbedding(query);

        // Get semantic scores for fulltext results
        const enhancedResults = await Promise.all(
          fulltextResults.map(async (result) => {
            if (result.embedding) {
              const similarity = this.calculateSimilarity(queryEmbedding, result.embedding);
              return {
                ...result,
                semantic_score: similarity,
                combined_score: (result.fulltext_score + similarity) / 2
              };
            }
            return {
              ...result,
              semantic_score: 0,
              combined_score: result.fulltext_score
            };
          })
        );

        return enhancedResults.sort((a, b) => b.combined_score - a.combined_score);
      }

      return fulltextResults;
    } finally {
      await session.close();
    }
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  calculateSimilarity(embedding1, embedding2) {
    if (!embedding1 || !embedding2 || embedding1.length !== embedding2.length) {
      return 0;
    }

    try {
      return 1 - distance.cosine(embedding1, embedding2);
    } catch (error) {
      console.warn('Similarity calculation failed:', error);
      return 0;
    }
  }

  /**
   * Cluster concepts based on semantic similarity
   */
  async clusterConcepts(minClusterSize = 3, maxClusters = 50) {
    const session = this.driver.session();
    try {
      // Get all concepts with embeddings
      const conceptsResult = await session.run(`
        MATCH (c:Concept)
        WHERE c.embedding IS NOT NULL
        RETURN c.id AS id, c.name AS name, c.embedding AS embedding
        LIMIT 1000
      `);

      const concepts = conceptsResult.records.map(record => ({
        id: record.get('id'),
        name: record.get('name'),
        embedding: record.get('embedding')
      }));

      if (concepts.length < minClusterSize) {
        return { clusters: [], message: 'Insufficient concepts for clustering' };
      }

      // Simple clustering algorithm (in production, use proper clustering)
      const clusters = this.performHierarchicalClustering(concepts, this.config.clusterThreshold);

      // Update cluster assignments in database
      for (let i = 0; i < clusters.length; i++) {
        const cluster = clusters[i];
        if (cluster.members.length >= minClusterSize) {
          await session.run(`
            UNWIND $memberIds AS memberId
            MATCH (c:Concept {id: memberId})
            SET c.cluster_id = $clusterId,
                c.cluster_membership = $membership,
                c.cluster_updated = timestamp()
          `, {
            memberIds: cluster.members.map(m => m.id),
            clusterId: `cluster_${i}`,
            membership: cluster.members.length
          });
        }
      }

      return {
        clusters: clusters.map((cluster, i) => ({
          id: `cluster_${i}`,
          size: cluster.members.length,
          centroid: cluster.centroid,
          members: cluster.members.map(m => ({ id: m.id, name: m.name }))
        })),
        totalClusters: clusters.filter(c => c.members.length >= minClusterSize).length,
        totalConcepts: concepts.length
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Simple hierarchical clustering implementation
   */
  performHierarchicalClustering(concepts, threshold) {
    const clusters = concepts.map(concept => ({
      members: [concept],
      centroid: concept.embedding
    }));

    let merged = true;
    while (merged && clusters.length > 1) {
      merged = false;
      let maxSimilarity = threshold;
      let mergeIndices = [-1, -1];

      // Find most similar clusters
      for (let i = 0; i < clusters.length; i++) {
        for (let j = i + 1; j < clusters.length; j++) {
          const similarity = this.calculateSimilarity(clusters[i].centroid, clusters[j].centroid);
          if (similarity > maxSimilarity) {
            maxSimilarity = similarity;
            mergeIndices = [i, j];
            merged = true;
          }
        }
      }

      // Merge clusters if similar enough
      if (merged) {
        const [i, j] = mergeIndices;
        const newCluster = {
          members: [...clusters[i].members, ...clusters[j].members],
          centroid: this.calculateCentroid([clusters[i].centroid, clusters[j].centroid])
        };

        clusters.splice(j, 1); // Remove second cluster first (higher index)
        clusters.splice(i, 1); // Remove first cluster
        clusters.push(newCluster);
      }
    }

    return clusters;
  }

  /**
   * Calculate centroid of multiple embeddings
   */
  calculateCentroid(embeddings) {
    if (!embeddings || embeddings.length === 0) return null;

    const dimensions = embeddings[0].length;
    const centroid = new Array(dimensions).fill(0);

    for (const embedding of embeddings) {
      for (let i = 0; i < dimensions; i++) {
        centroid[i] += embedding[i];
      }
    }

    for (let i = 0; i < dimensions; i++) {
      centroid[i] /= embeddings.length;
    }

    return centroid;
  }

  /**
   * Build semantic similarity relationships in the graph
   */
  async buildSemanticRelationships(threshold = null, batchSize = 100) {
    const session = this.driver.session();
    try {
      const useThreshold = threshold || this.config.similarityThreshold;

      // Clear existing semantic relationships
      await session.run(`
        MATCH ()-[r:SEMANTICALLY_SIMILAR]->()
        DELETE r
      `);

      // Get all concepts with embeddings in batches
      let offset = 0;
      let hasMore = true;
      let relationshipsCreated = 0;

      while (hasMore) {
        const conceptsResult = await session.run(`
          MATCH (c:Concept)
          WHERE c.embedding IS NOT NULL
          RETURN c.id AS id, c.embedding AS embedding
          SKIP $offset LIMIT $batchSize
        `, { offset, batchSize });

        const concepts = conceptsResult.records.map(record => ({
          id: record.get('id'),
          embedding: record.get('embedding')
        }));

        if (concepts.length === 0) {
          hasMore = false;
          break;
        }

        // Calculate similarities within batch
        for (let i = 0; i < concepts.length; i++) {
          for (let j = i + 1; j < concepts.length; j++) {
            const similarity = this.calculateSimilarity(
              concepts[i].embedding,
              concepts[j].embedding
            );

            if (similarity >= useThreshold) {
              await session.run(`
                MATCH (c1:Concept {id: $id1}), (c2:Concept {id: $id2})
                CREATE (c1)-[r:SEMANTICALLY_SIMILAR {
                  similarity: $similarity,
                  type: 'semantic',
                  created: timestamp()
                }]->(c2)
              `, {
                id1: concepts[i].id,
                id2: concepts[j].id,
                similarity
              });
              relationshipsCreated++;
            }
          }
        }

        offset += batchSize;
        console.log(`Processed ${offset} concepts, created ${relationshipsCreated} relationships`);
      }

      return {
        relationshipsCreated,
        threshold: useThreshold,
        message: `Built ${relationshipsCreated} semantic relationships`
      };
    } finally {
      await session.close();
    }
  }

  /**
   * Get semantic insights for a concept
   */
  async getSemanticInsights(conceptId) {
    const session = this.driver.session();
    try {
      const result = await session.run(`
        MATCH (c:Concept {id: $conceptId})
        OPTIONAL MATCH (c)-[sim:SEMANTICALLY_SIMILAR]-(related:Concept)
        OPTIONAL MATCH (c)-[:EXPRESSES]->(props:Proposition)
        RETURN c {
          .id, .name, .type, .description, .cluster_id,
          semanticNeighbors: collect(DISTINCT related.name)[0..5],
          similarityScores: collect(DISTINCT sim.similarity)[0..5],
          propositionCount: count(DISTINCT props),
          lastEmbeddingUpdate: c.embedding_updated
        } AS insights
      `, { conceptId });

      return result.records[0]?.get('insights') || null;
    } finally {
      await session.close();
    }
  }

  /**
   * Optimize knowledge graph traversal using semantic indexes
   */
  async optimizeGraphTraversal(startConceptId, targetConceptId, maxDepth = 4) {
    const session = this.driver.session();
    try {
      // Use semantic similarity to guide traversal
      const result = await session.run(`
        MATCH (start:Concept {id: $startConceptId}), (target:Concept {id: $targetConceptId})
        CALL apoc.path.findPath(start, target,
          'SEMANTICALLY_SIMILAR|EXPRESSES|OPPOSITE_OF|SIMILAR_TO',
          '',
          {maxLevel: $maxDepth, uniqueness: 'NODE_GLOBAL'}
        ) YIELD path
        WITH path,
             [rel IN relationships(path) |
               CASE type(rel)
                 WHEN 'SEMANTICALLY_SIMILAR' THEN rel.similarity
                 ELSE 0.5
               END
             ] AS scores
        RETURN path,
               reduce(total = 0, score IN scores | total + score) / length(scores) AS avgScore
        ORDER BY avgScore DESC
        LIMIT 5
      `, { startConceptId, targetConceptId, maxDepth });

      return result.records.map(record => ({
        path: record.get('path'),
        averageScore: record.get('avgScore'),
        length: record.get('path').length
      }));
    } finally {
      await session.close();
    }
  }

  /**
   * Generate semantic report for the knowledge base
   */
  async generateSemanticReport() {
    const session = this.driver.session();
    try {
      const stats = await session.run(`
        MATCH (c:Concept)
        WITH count(c) AS totalConcepts,
             count(CASE WHEN c.embedding IS NOT NULL THEN 1 END) AS embeddedConcepts,
             count(CASE WHEN c.cluster_id IS NOT NULL THEN 1 END) AS clusteredConcepts
        MATCH ()-[r:SEMANTICALLY_SIMILAR]->()
        WITH totalConcepts, embeddedConcepts, clusteredConcepts, count(r) AS semanticRelationships
        MATCH (c:Concept)
        WHERE c.cluster_id IS NOT NULL
        RETURN totalConcepts, embeddedConcepts, clusteredConcepts, semanticRelationships,
               count(DISTINCT c.cluster_id) AS totalClusters
      `);

      const record = stats.records[0];
      return {
        totalConcepts: record.get('totalConcepts').toNumber(),
        embeddedConcepts: record.get('embeddedConcepts').toNumber(),
        clusteredConcepts: record.get('clusteredConcepts').toNumber(),
        semanticRelationships: record.get('semanticRelationships').toNumber(),
        totalClusters: record.get('totalClusters').toNumber(),
        embeddingCoverage: (record.get('embeddedConcepts').toNumber() /
                           record.get('totalConcepts').toNumber() * 100).toFixed(2) + '%',
        clusteringCoverage: (record.get('clusteredConcepts').toNumber() /
                           record.get('totalConcepts').toNumber() * 100).toFixed(2) + '%',
        timestamp: new Date().toISOString()
      };
    } finally {
      await session.close();
    }
  }
}