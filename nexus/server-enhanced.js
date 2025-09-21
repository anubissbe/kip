import express from "express";
import { z } from "zod";
import neo4j from "neo4j-driver";
import { KQLParser, isLegacyQuery, convertLegacyToKQL } from "./kql-parser.js";
import { EnhancedKQLParser } from "./kql-parser-enhanced.js";
import { PropositionHandler, parsePropositionSyntax } from "./proposition-handler.js";
import { ConceptPropositionTransformer } from "./concept-transformer.js";
import { CognitiveInterface } from "./cognitive-interface.js";
import { MetadataTracker } from "./metadata-tracker.js";
import { TypeSystemEngine } from "./type-system.js";
import TypeValidationMiddleware from "./type-validation-middleware.js";

const PORT = process.env.PORT || 8081;
const KIP_TOKEN = process.env.KIP_TOKEN || "changeme-kip-token";
const NEO4J_URI = process.env.NEO4J_URI || "bolt://neo4j:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "changeme-neo4j";

const app = express();
app.use(express.json({ limit: '10mb' }));

// Initialize Type System (Phase 6)
const typeSystem = new TypeSystemEngine();
const typeValidation = new TypeValidationMiddleware();

// Apply type validation middleware
app.use(typeValidation.middleware());
app.use(typeValidation.validateResponse());

const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));

function auth(req, res, next) {
  const hdr = req.headers["authorization"] || "";
  if (!hdr.startsWith("Bearer ") || hdr.slice(7) !== KIP_TOKEN) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

const QuerySchema = z.object({ query: z.string().min(1) });

app.get("/.well-known/ai-plugin.json", (_req, res) => {
  res.json({
    schema_version: "v1",
    name_for_human: "KIP Nexus",
    name_for_model: "kip",
    description_for_model: "Execute KIP queries (FIND/UPSERT) over a knowledge graph with Phase 6 type enforcement.",
    tools: [{
      name: "execute_kip",
      description: "Run a KIP query with type validation; returns JSON.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string" },
          mode: { type: "string", enum: ["legacy", "kql"] },
          options: {
            type: "object",
            properties: {
              enableTypeCoercion: { type: "boolean" },
              strictValidation: { type: "boolean" }
            }
          }
        },
        required: ["query"]
      }
    }]
  });
});

// Initialize all handlers
const kqlParser = new KQLParser();
const enhancedKQLParser = new EnhancedKQLParser(typeSystem);
const propositionHandler = new PropositionHandler(driver);
const conceptTransformer = new ConceptPropositionTransformer(driver);
const cognitiveInterface = new CognitiveInterface(driver);
const metadataTracker = new MetadataTracker(driver);

// Type System Status Endpoint
app.get("/type-system/status", auth, (req, res) => {
  const stats = typeValidation.getStats();
  const schemas = typeSystem.listSchemas();
  const cacheStats = typeSystem.getCacheStats();

  res.json({
    ok: true,
    phase: "Phase 6 - Type System Enforcement",
    compliance: stats.phase6ComplianceLevel,
    schemas: schemas.length,
    validationStats: stats,
    cacheStats,
    availableSchemas: schemas,
    timestamp: new Date().toISOString()
  });
});

// Enhanced KQL endpoint with full type validation (Phase 6 compliant)
app.post("/kql", auth, async (req, res) => {
  const startTime = Date.now();

  try {
    const { query, options = {} } = req.body;
    const session = driver.session();
    const q = String(query || "").trim();

    // Use type-validated AST from middleware
    const typeValidatedAST = req.typeValidation?.data?.ast;

    if (!typeValidatedAST) {
      return res.status(400).json({
        ok: false,
        error: "Type validation failed or missing",
        typeValidation: {
          enabled: true,
          passed: false,
          errors: ["AST validation missing"]
        }
      });
    }

    // Generate Cypher from validated AST
    const { cypher, params, limit, cursor, cursorData, hasAggregation } =
      enhancedKQLParser.toCypher ? enhancedKQLParser.toCypher(typeValidatedAST) :
      kqlParser.toCypher(typeValidatedAST);

    const r = await session.run(cypher, params);

    let allResults, hasMore, data, nextCursor = null;

    if (hasAggregation) {
      allResults = r.records.map(rec => rec.toObject());
      hasMore = false;
      data = allResults;
    } else {
      allResults = r.records.map(rec => ({
        ...rec.toObject(),
        node_id: rec.get("node_id")
      }));

      hasMore = allResults.length > limit;
      data = hasMore ? allResults.slice(0, limit) : allResults;

      if (hasMore) {
        const queryInfo = {
          find: typeValidatedAST.clauses.find(c => c.type === 'FindClause')?.outputs[0]?.value || 'Concept',
          where: JSON.stringify(typeValidatedAST.clauses.filter(c => c.type === 'WhereClause')),
          filter: JSON.stringify(typeValidatedAST.clauses.filter(c => c.type === 'FilterClause')),
          offset: cursorData ? cursorData.offset : 0
        };
        nextCursor = kqlParser.createCursor(allResults, queryInfo, limit);
      }
    }

    await session.close();

    const executionTime = Date.now() - startTime;

    const response = {
      ok: true,
      data: hasAggregation ? data : data.map(item => {
        const { node_id, ...rest } = item;
        return rest;
      }),
      pagination: hasAggregation ? undefined : {
        hasMore,
        cursor: nextCursor,
        limit
      },
      _model: "concept-proposition",
      metadata: {
        query_type: hasAggregation ? "aggregation" : "kql",
        has_aggregation: hasAggregation,
        execution_time_ms: executionTime,
        type_validation: req.typeValidation.data.typeValidation,
        compliance_score: req.typeValidation.complianceScore,
        phase: "Phase 6"
      }
    };

    // Validate response structure
    const responseValidation = typeSystem.validateResponse(response);
    if (!responseValidation.success) {
      console.warn("Response validation failed:", responseValidation.errors);
    }

    return res.json(response);
  } catch (e) {
    console.error("Enhanced KQL error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: {
        enabled: true,
        passed: false,
        errors: [String(e)]
      }
    });
  }
});

// Legacy execute_kip endpoint with type validation overlay
app.post("/execute_kip", auth, async (req, res) => {
  const startTime = Date.now();

  try {
    const { query } = QuerySchema.parse(req.body);
    const session = driver.session();
    const q = String(query || "").trim();

    // Apply basic type validation even for legacy queries
    const queryValidation = typeSystem.validate('KQLQuery', { query });
    const hasTypeErrors = !queryValidation.success;

    // Handle UPSERT operations with type validation
    if (/^UPSERT\s+\w+\s+\{/.test(q)) {
      const m = q.match(/^UPSERT\s+(\w+)\s+\{(.+)\}\s*$/i);
      if (!m) return res.status(400).json({ error: "Bad UPSERT syntax" });
      const label = m[1];
      const propsStr = m[2];
      const props = {};
      for (const kv of propsStr.split(",")) {
        const pm = kv.trim().match(/^([\w.]+)\s*:\s*'([^']*)'$/);
        if (pm) props[pm[1]] = pm[2];
      }

      // Validate UPSERT data
      const upsertValidation = typeSystem.validateUpsert(label, props);
      if (!upsertValidation.success) {
        return res.status(400).json({
          ok: false,
          error: "UPSERT validation failed",
          details: upsertValidation.errors,
          typeValidation: {
            enabled: true,
            passed: false,
            errors: upsertValidation.errors.map(e => e.message)
          }
        });
      }

      if (!props.name) return res.status(400).json({ error: "UPSERT requires name" });

      // Create Concept
      const cy = `MERGE (n:Concept {name: $name})
                  SET n.type = $type, n._legacy = $label, n.updated = timestamp()
                  RETURN properties(n) AS node`;
      const r = await session.run(cy, {
        name: props.name,
        type: label,
        label: label
      });
      const concept = r.records[0]?.get("node") || null;

      // Create Propositions for additional properties
      const propositions = [];
      for (const [key, value] of Object.entries(props)) {
        if (key !== 'name') {
          try {
            // Validate proposition data
            const propValidation = typeSystem.validateProposition({
              subject: props.name,
              predicate: key,
              object: value,
              metadata: { source: 'upsert', timestamp: new Date().toISOString() }
            });

            if (propValidation.success) {
              const prop = await propositionHandler.createProposition(propValidation.data);
              propositions.push(prop);
            } else {
              console.warn(`Proposition validation failed for ${key}:`, propValidation.errors);
            }
          } catch (e) {
            console.error(`Failed to create proposition for ${key}:`, e);
          }
        }
      }

      await session.close();

      const executionTime = Date.now() - startTime;

      return res.json({
        ok: true,
        data: concept,
        propositions: propositions.length > 0 ? propositions : undefined,
        typeValidation: {
          enabled: true,
          passed: !hasTypeErrors,
          errors: hasTypeErrors ? queryValidation.errors.map(e => e.message) : []
        },
        metadata: {
          execution_time_ms: executionTime,
          phase: "Phase 6 (Legacy Mode)"
        }
      });
    }

    // Handle legacy FIND queries
    if (isLegacyQuery(q)) {
      const findRe = /^FIND(?:\s+(\*|ALL|\w+))?(?:\s+WHERE\s+([\w.]+)\s*(=|CONTAINS)\s*'([^']*)')?(?:\s+LIMIT\s+(\d+))?\s*$/i;
      const m = q.match(findRe);
      if (m) {
        const label = m[1];
        const field = m[2];
        const op    = m[3];
        const value = m[4];
        const limit = Math.max(1, Math.min(parseInt(m[5] || "10", 10), 200));

        let whereCy = "";
        const params = {};

        if (field && value != null) {
          if (field === "name") {
            if (op === "=") { whereCy = `WHERE n.name = $value`; params.value = value; }
            else { whereCy = `WHERE toLower(n.name) CONTAINS toLower($value)`; params.value = value; }
          } else {
            if (label && label !== "*" && label !== "ALL") {
              whereCy = `WHERE n.type = $type AND n.${field} = $value`;
              params.type = label;
              params.value = value;
            } else {
              if (op === "=") { whereCy = `WHERE n.${field} = $value`; params.value = value; }
              else { whereCy = `WHERE toLower(n.${field}) CONTAINS toLower($value)`; params.value = value; }
            }
          }
        } else if (label && label !== "*" && label !== "ALL") {
          whereCy = `WHERE n.type = $type OR n._legacy = $type`;
          params.type = label;
        }

        const cy = `MATCH (n:Concept) ${whereCy} RETURN properties(n) AS node LIMIT ${limit}`;
        const r = await session.run(cy, params);
        const data = r.records.map(rec => rec.get("node"));
        await session.close();

        const executionTime = Date.now() - startTime;

        return res.json({
          ok: true,
          data,
          typeValidation: {
            enabled: true,
            passed: !hasTypeErrors,
            errors: hasTypeErrors ? queryValidation.errors.map(e => e.message) : []
          },
          metadata: {
            execution_time_ms: executionTime,
            phase: "Phase 6 (Legacy Mode)"
          }
        });
      }
    } else {
      // Try to parse as enhanced KQL with type validation
      try {
        const enhancedAST = enhancedKQLParser.parseWithTypeValidation(q);
        const { cypher, params, limit, cursor, cursorData, hasAggregation } = kqlParser.toCypher(enhancedAST);

        const r = await session.run(cypher, params);

        let allResults, hasMore, data, nextCursor = null;

        if (hasAggregation) {
          allResults = r.records.map(rec => rec.toObject());
          hasMore = false;
          data = allResults;
        } else {
          allResults = r.records.map(rec => ({
            concept: rec.get("n"),
            propositions: rec.get("propositions"),
            node_id: rec.get("node_id")
          }));

          hasMore = allResults.length > limit;
          data = hasMore ? allResults.slice(0, limit) : allResults;

          if (hasMore) {
            const queryInfo = {
              find: enhancedAST.clauses.find(c => c.type === 'FindClause')?.outputs[0]?.value || 'Concept',
              where: JSON.stringify(enhancedAST.clauses.filter(c => c.type === 'WhereClause')),
              filter: JSON.stringify(enhancedAST.clauses.filter(c => c.type === 'FilterClause')),
              offset: cursorData ? cursorData.offset : 0
            };
            nextCursor = kqlParser.createCursor(allResults, queryInfo, limit);
          }
        }

        await session.close();

        const executionTime = Date.now() - startTime;

        return res.json({
          ok: true,
          data: hasAggregation ? data : data.map(item => ({
            concept: item.concept,
            propositions: item.propositions
          })),
          pagination: hasAggregation ? undefined : {
            hasMore,
            cursor: nextCursor,
            limit
          },
          typeValidation: {
            enabled: true,
            passed: true,
            complianceScore: enhancedAST.typeValidation.typeCompliance.score
          },
          metadata: {
            query_type: hasAggregation ? "aggregation" : "enhanced_kql",
            has_aggregation: hasAggregation,
            execution_time_ms: executionTime,
            type_compliance: enhancedAST.typeValidation.typeCompliance,
            phase: "Phase 6"
          }
        });
      } catch (parseError) {
        await session.close();
        return res.status(400).json({
          ok: false,
          error: `Enhanced KQL parse error: ${parseError.message}`,
          typeValidation: {
            enabled: true,
            passed: false,
            errors: [parseError.message]
          }
        });
      }
    }

    await session.close();
    return res.status(400).json({ error: "Bad query syntax" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: {
        enabled: true,
        passed: false,
        errors: [String(e)]
      }
    });
  }
});

// Enhanced proposition operations with type validation
app.post("/propositions", auth, async (req, res) => {
  try {
    const { action, subject, predicate, object, metadata } = req.body;

    switch (action) {
      case 'create':
        // Type validation handled by middleware
        const validatedData = req.typeValidation?.data;
        if (!validatedData) {
          return res.status(400).json({
            ok: false,
            error: "Type validation failed",
            typeValidation: { enabled: true, passed: false }
          });
        }

        const proposition = await propositionHandler.createProposition(validatedData);
        return res.json({
          ok: true,
          data: proposition,
          typeValidation: { enabled: true, passed: true }
        });

      case 'query':
        const propositions = await propositionHandler.getPropositions(subject, predicate);
        return res.json({
          ok: true,
          data: propositions,
          typeValidation: { enabled: true, passed: true }
        });

      case 'find':
        const concepts = await propositionHandler.findConceptsByProposition(predicate, object);
        return res.json({
          ok: true,
          data: concepts,
          typeValidation: { enabled: true, passed: true }
        });

      case 'graph':
        const graph = await propositionHandler.getConceptGraph(subject, req.body.depth || 2);
        return res.json({
          ok: true,
          data: graph,
          typeValidation: { enabled: true, passed: true }
        });

      default:
        return res.status(400).json({
          ok: false,
          error: "Invalid action",
          typeValidation: { enabled: true, passed: false }
        });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: { enabled: true, passed: false }
    });
  }
});

// Preserve existing cognitive and metadata endpoints...
app.post("/cognitive/suggest", auth, async (req, res) => {
  try {
    const { context } = req.body;
    const suggestions = await cognitiveInterface.suggestQueries(context || {});

    await metadataTracker.trackQuery(
      "COGNITIVE_SUGGEST",
      suggestions,
      { type: "suggestion_generation", context }
    );

    return res.json({
      ok: true,
      ...suggestions,
      typeValidation: { enabled: true, passed: true }
    });
  } catch (e) {
    console.error("Suggestion error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: { enabled: true, passed: false }
    });
  }
});

app.post("/cognitive/clarify", auth, async (req, res) => {
  try {
    const { query, context } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query required for clarification" });
    }

    const clarification = await cognitiveInterface.requestClarification(query, context);

    await metadataTracker.trackQuery(
      "COGNITIVE_CLARIFY",
      clarification,
      { type: "clarification_request", originalQuery: query }
    );

    return res.json({
      ok: true,
      ...clarification,
      typeValidation: { enabled: true, passed: true }
    });
  } catch (e) {
    console.error("Clarification error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: { enabled: true, passed: false }
    });
  }
});

app.post("/cognitive/feedback", auth, async (req, res) => {
  try {
    const { suggestionId, wasUseful, feedback } = req.body;

    if (!suggestionId) {
      return res.status(400).json({ error: "suggestionId required" });
    }

    const result = await cognitiveInterface.learnFromFeedback(
      suggestionId,
      wasUseful,
      feedback
    );

    await metadataTracker.trackLearning(
      `suggestion_${suggestionId}`,
      { success: wasUseful, confidence: 0.8, feedback }
    );

    return res.json({
      ok: true,
      ...result,
      typeValidation: { enabled: true, passed: true }
    });
  } catch (e) {
    console.error("Feedback error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: { enabled: true, passed: false }
    });
  }
});

app.post("/cognitive/predict", auth, async (req, res) => {
  try {
    const { history } = req.body;
    const predictions = await cognitiveInterface.predictNextQuery(history);

    return res.json({
      ok: true,
      ...predictions,
      typeValidation: { enabled: true, passed: true }
    });
  } catch (e) {
    console.error("Prediction error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: { enabled: true, passed: false }
    });
  }
});

app.post("/cognitive/session", auth, async (req, res) => {
  try {
    const { action, sessionId } = req.body;

    if (action === "create") {
      const session = await cognitiveInterface.createCognitiveSession(
        sessionId || `session_${Date.now()}`
      );
      return res.json({
        ok: true,
        ...session,
        typeValidation: { enabled: true, passed: true }
      });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (e) {
    console.error("Session error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: { enabled: true, passed: false }
    });
  }
});

app.get("/metadata/transparency/:queryId", auth, async (req, res) => {
  try {
    const { queryId } = req.params;
    const report = await metadataTracker.getTransparencyReport(queryId);

    return res.json({
      ok: true,
      ...report,
      typeValidation: { enabled: true, passed: true }
    });
  } catch (e) {
    console.error("Transparency error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: { enabled: true, passed: false }
    });
  }
});

app.post("/metadata/chain", auth, async (req, res) => {
  try {
    const { steps } = req.body;

    if (!steps || !Array.isArray(steps)) {
      return res.status(400).json({ error: "Steps array required" });
    }

    const chain = await metadataTracker.captureChainOfThought(steps);

    return res.json({
      ok: true,
      ...chain,
      typeValidation: { enabled: true, passed: true }
    });
  } catch (e) {
    console.error("Chain tracking error:", e);
    return res.status(500).json({
      ok: false,
      error: String(e),
      typeValidation: { enabled: true, passed: false }
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 KIP Nexus Server (Phase 6 - Type System Enforcement) running on port :${PORT}`);
  console.log(`📊 Type System: ${typeSystem.listSchemas().length} schemas registered`);
  console.log(`🔒 Type Validation: ENABLED`);
  console.log(`🎯 Compliance Target: Phase 6 (90%)`);
});