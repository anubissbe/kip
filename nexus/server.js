
import express from "express";
import { z } from "zod";
import neo4j from "neo4j-driver";
import { KQLParser, isLegacyQuery, convertLegacyToKQL } from "./kql-parser.js";
import { PropositionHandler, parsePropositionSyntax } from "./proposition-handler.js";
import { ConceptPropositionTransformer } from "./concept-transformer.js";
import { CognitiveInterface } from "./cognitive-interface.js";
import { MetadataTracker } from "./metadata-tracker.js";

const PORT = process.env.PORT || 8081;
const KIP_TOKEN = process.env.KIP_TOKEN || "changeme-kip-token";
const NEO4J_URI = process.env.NEO4J_URI || "bolt://neo4j:7687";
const NEO4J_USER = process.env.NEO4J_USER || "neo4j";
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || "changeme-neo4j";

const app = express();
app.use(express.json());

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
    description_for_model: "Execute KIP queries (FIND/UPSERT) over a knowledge graph.",
    tools: [{
      name: "execute_kip",
      description: "Run a KIP query; returns JSON.",
      input_schema: { type: "object", properties: { query: { type: "string" }}, required: ["query"] }
    }]
  });
});

// Initialize all handlers
const kqlParser = new KQLParser();
const propositionHandler = new PropositionHandler(driver);
const conceptTransformer = new ConceptPropositionTransformer(driver);
const cognitiveInterface = new CognitiveInterface(driver);
const metadataTracker = new MetadataTracker(driver);

// Legacy endpoint for backward compatibility
app.post("/execute_kip", auth, async (req, res) => {
  try {
    const { query } = QuerySchema.parse(req.body);
    const session = driver.session();
    const q = String(query || "").trim();

    // Handle UPSERT operations (convert to Concept-Proposition model)
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
            const prop = await propositionHandler.createProposition({
              subject: props.name,
              predicate: key,
              object: value,
              metadata: { source: 'upsert', timestamp: new Date().toISOString() }
            });
            propositions.push(prop);
          } catch (e) {
            console.error(`Failed to create proposition for ${key}:`, e);
          }
        }
      }

      await session.close();
      return res.json({
        ok: true,
        data: concept,
        propositions: propositions.length > 0 ? propositions : undefined
      });
    }

    // Check if it's a legacy query or KQL
    if (isLegacyQuery(q)) {
      // Handle legacy FIND queries for backward compatibility
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

        // Convert to Concept-based query
        if (field && value != null) {
          if (field === "name") {
            // Direct name query
            if (op === "=") { whereCy = `WHERE n.name = $value`; params.value = value; }
            else { whereCy = `WHERE toLower(n.name) CONTAINS toLower($value)`; params.value = value; }
          } else {
            // Query by type and field
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
          // Query by type only
          whereCy = `WHERE n.type = $type OR n._legacy = $type`;
          params.type = label;
        }

        const cy = `MATCH (n:Concept) ${whereCy} RETURN properties(n) AS node LIMIT ${limit}`;
        const r = await session.run(cy, params);
        const data = r.records.map(rec => rec.get("node"));
        await session.close();
        return res.json({ ok: true, data });
      }
    } else {
      // Parse as KQL query
      try {
        const ast = kqlParser.parse(q);
        const { cypher, params, limit, cursor, cursorData, hasAggregation } = kqlParser.toCypher(ast);

        const r = await session.run(cypher, params);

        let allResults, hasMore, data, nextCursor = null;

        if (hasAggregation) {
          // Handle aggregation results
          allResults = r.records.map(rec => rec.toObject());
          hasMore = false; // Aggregation results are usually small
          data = allResults;
        } else {
          // Handle standard query results
          allResults = r.records.map(rec => ({
            concept: rec.get("n"),
            propositions: rec.get("propositions"),
            node_id: rec.get("node_id")
          }));

          // Check if there are more results
          hasMore = allResults.length > limit;
          data = hasMore ? allResults.slice(0, limit) : allResults;

          // Generate next cursor if there are more results
          if (hasMore) {
            const queryInfo = {
              find: ast.clauses.find(c => c.type === 'FindClause')?.outputs[0]?.value || 'Concept',
              where: JSON.stringify(ast.clauses.filter(c => c.type === 'WhereClause')),
              filter: JSON.stringify(ast.clauses.filter(c => c.type === 'FilterClause')),
              offset: cursorData ? cursorData.offset : 0
            };
            nextCursor = kqlParser.createCursor(allResults, queryInfo, limit);
          }
        }

        await session.close();

        const response = {
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
          metadata: {
            query_type: hasAggregation ? "aggregation" : "standard",
            has_aggregation: hasAggregation
          }
        };

        return res.json(response);
      } catch (parseError) {
        // Fallback to legacy handling if KQL parse fails
        return res.status(400).json({ error: `KQL parse error: ${parseError.message}` });
      }
    }

    return res.status(400).json({ error: "Bad query syntax" });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
});

// New KQL endpoint (fully ldclabs/KIP compliant)
app.post("/kql", auth, async (req, res) => {
  try {
    const { query } = req.body;
    const session = driver.session();
    const q = String(query || "").trim();

    // Use KQL parser with Concept-Proposition model
    const ast = kqlParser.parse(q);
    const { cypher, params, limit, cursor, cursorData, hasAggregation } = kqlParser.toCypher(ast);

    const r = await session.run(cypher, params);

    let allResults, hasMore, data, nextCursor = null;

    if (hasAggregation) {
      // Handle aggregation results
      allResults = r.records.map(rec => rec.toObject());
      hasMore = false; // Aggregation results are usually small
      data = allResults;
    } else {
      // Handle standard query results
      allResults = r.records.map(rec => ({
        ...rec.toObject(),
        node_id: rec.get("node_id")
      }));

      // Check if there are more results
      hasMore = allResults.length > limit;
      data = hasMore ? allResults.slice(0, limit) : allResults;

      // Generate next cursor if there are more results
      if (hasMore) {
        const queryInfo = {
          find: ast.clauses.find(c => c.type === 'FindClause')?.outputs[0]?.value || 'Concept',
          where: JSON.stringify(ast.clauses.filter(c => c.type === 'WhereClause')),
          filter: JSON.stringify(ast.clauses.filter(c => c.type === 'FilterClause')),
          offset: cursorData ? cursorData.offset : 0
        };
        nextCursor = kqlParser.createCursor(allResults, queryInfo, limit);
      }
    }

    await session.close();

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
        query_type: hasAggregation ? "aggregation" : "standard",
        has_aggregation: hasAggregation
      }
    };

    return res.json(response);
  } catch (e) {
    console.error("KQL error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

// Legacy execute_kql endpoint for backward compatibility
app.post("/execute_kql", auth, async (req, res) => {
  try {
    const { query, mode } = req.body;
    const session = driver.session();
    const q = String(query || "").trim();

    if (mode === "legacy" || isLegacyQuery(q)) {
      // Forward to legacy handler
      return app._router.handle({
        ...req,
        url: "/execute_kip",
        body: { query }
      }, res);
    }

    // Parse and execute KQL
    const ast = kqlParser.parse(q);
    const { cypher, params, limit, cursor, cursorData, hasAggregation } = kqlParser.toCypher(ast);

    const r = await session.run(cypher, params);

    let allResults, hasMore, data, nextCursor = null;

    if (hasAggregation) {
      // Handle aggregation results
      allResults = r.records.map(rec => rec.toObject());
      hasMore = false; // Aggregation results are usually small
      data = allResults;
    } else {
      // Handle standard query results
      allResults = r.records.map(rec => ({
        concept: rec.get("n"),
        propositions: rec.get("propositions") || [],
        node_id: rec.get("node_id")
      }));

      // Check if there are more results
      hasMore = allResults.length > limit;
      data = hasMore ? allResults.slice(0, limit) : allResults;

      // Generate next cursor if there are more results
      if (hasMore) {
        const queryInfo = {
          find: ast.clauses.find(c => c.type === 'FindClause')?.outputs[0]?.value || 'Concept',
          where: JSON.stringify(ast.clauses.filter(c => c.type === 'WhereClause')),
          filter: JSON.stringify(ast.clauses.filter(c => c.type === 'FilterClause')),
          offset: cursorData ? cursorData.offset : 0
        };
        nextCursor = kqlParser.createCursor(allResults, queryInfo, limit);
      }
    }

    await session.close();
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
      metadata: {
        query_type: hasAggregation ? "aggregation" : "kql",
        has_aggregation: hasAggregation,
        ast_depth: ast.clauses.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
});

// Proposition operations endpoint
app.post("/propositions", auth, async (req, res) => {
  try {
    const { action, subject, predicate, object, metadata } = req.body;

    switch (action) {
      case 'create':
        const proposition = await propositionHandler.createProposition({
          subject, predicate, object, metadata
        });
        return res.json({ ok: true, data: proposition });

      case 'query':
        const propositions = await propositionHandler.getPropositions(subject, predicate);
        return res.json({ ok: true, data: propositions });

      case 'find':
        const concepts = await propositionHandler.findConceptsByProposition(predicate, object);
        return res.json({ ok: true, data: concepts });

      case 'graph':
        const graph = await propositionHandler.getConceptGraph(subject, req.body.depth || 2);
        return res.json({ ok: true, data: graph });

      default:
        return res.status(400).json({ error: "Invalid action" });
    }
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: String(e) });
  }
});

// Cognitive Communication Endpoints

// Query suggestions endpoint
app.post("/cognitive/suggest", auth, async (req, res) => {
  try {
    const { context } = req.body;
    const suggestions = await cognitiveInterface.suggestQueries(context || {});

    // Track the suggestion generation
    await metadataTracker.trackQuery(
      "COGNITIVE_SUGGEST",
      suggestions,
      { type: "suggestion_generation", context }
    );

    return res.json({ ok: true, ...suggestions });
  } catch (e) {
    console.error("Suggestion error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

// Clarification request endpoint
app.post("/cognitive/clarify", auth, async (req, res) => {
  try {
    const { query, context } = req.body;

    if (!query) {
      return res.status(400).json({ error: "Query required for clarification" });
    }

    const clarification = await cognitiveInterface.requestClarification(query, context);

    // Track the clarification request
    await metadataTracker.trackQuery(
      "COGNITIVE_CLARIFY",
      clarification,
      { type: "clarification_request", originalQuery: query }
    );

    return res.json({ ok: true, ...clarification });
  } catch (e) {
    console.error("Clarification error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

// Learning feedback endpoint
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

    // Track the learning
    await metadataTracker.trackLearning(
      `suggestion_${suggestionId}`,
      { success: wasUseful, confidence: 0.8, feedback }
    );

    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error("Feedback error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

// Query prediction endpoint
app.post("/cognitive/predict", auth, async (req, res) => {
  try {
    const { history } = req.body;
    const predictions = await cognitiveInterface.predictNextQuery(history);

    return res.json({ ok: true, ...predictions });
  } catch (e) {
    console.error("Prediction error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

// Cognitive session management
app.post("/cognitive/session", auth, async (req, res) => {
  try {
    const { action, sessionId } = req.body;

    if (action === "create") {
      const session = await cognitiveInterface.createCognitiveSession(
        sessionId || `session_${Date.now()}`
      );
      return res.json({ ok: true, ...session });
    }

    return res.status(400).json({ error: "Invalid action" });
  } catch (e) {
    console.error("Session error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

// Metadata transparency endpoint
app.get("/metadata/transparency/:queryId", auth, async (req, res) => {
  try {
    const { queryId } = req.params;
    const report = await metadataTracker.getTransparencyReport(queryId);

    return res.json({ ok: true, ...report });
  } catch (e) {
    console.error("Transparency error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

// Chain of thought tracking
app.post("/metadata/chain", auth, async (req, res) => {
  try {
    const { steps } = req.body;

    if (!steps || !Array.isArray(steps)) {
      return res.status(400).json({ error: "Steps array required" });
    }

    const chain = await metadataTracker.captureChainOfThought(steps);

    return res.json({ ok: true, ...chain });
  } catch (e) {
    console.error("Chain tracking error:", e);
    return res.status(500).json({ error: String(e) });
  }
});

app.listen(PORT, () => console.log(`kip-nexus on :${PORT}`));
