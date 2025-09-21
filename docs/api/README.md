# KIP API Documentation

## Overview

The Knowledge Integration Platform (KIP) provides a comprehensive REST API for managing knowledge graphs, semantic search, and advanced analytics. This documentation covers all available endpoints, authentication methods, and usage examples.

## Base URL

```
https://api.kip.dev/v1
http://localhost:8081  (Development)
```

## Authentication

All API requests require authentication using Bearer tokens:

```http
Authorization: Bearer your-kip-token
```

## Core Endpoints

### Knowledge Management

#### Execute KIP Query
Execute KQL (Knowledge Query Language) queries against the knowledge graph.

```http
POST /execute_kip
Content-Type: application/json
Authorization: Bearer {token}

{
  "query": "FIND Concept WHERE type='AI'",
  "optimize": true,
  "semantic": true,
  "metadata": {
    "source": "api_client",
    "timestamp": "2025-01-21T10:00:00Z"
  }
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "id": "concept-123",
      "type": "Concept",
      "properties": {
        "name": "Artificial Intelligence",
        "type": "AI",
        "description": "Machine intelligence systems"
      },
      "relationships": []
    }
  ],
  "metadata": {
    "query_time": 45,
    "optimization_applied": true,
    "semantic_enhancement": true,
    "result_count": 1
  }
}
```

### Semantic Search

#### Semantic Search
Perform semantic similarity search using vector embeddings.

```http
POST /semantic/search
Content-Type: application/json
Authorization: Bearer {token}

{
  "query": "machine learning algorithms",
  "limit": 10,
  "threshold": 0.7,
  "include_similar": true,
  "embedding_model": "all-MiniLM-L6-v2"
}
```

**Response:**
```json
{
  "success": true,
  "results": [
    {
      "concept_id": "concept-456",
      "name": "Neural Networks",
      "similarity_score": 0.89,
      "embedding": [0.1, 0.2, ...],
      "related_concepts": ["concept-789", "concept-101"]
    }
  ],
  "metadata": {
    "search_time": 35,
    "total_embeddings": 10000,
    "similarity_threshold": 0.7
  }
}
```

### Analytics

#### Graph Analytics
Run comprehensive graph analytics on the knowledge graph.

```http
POST /analytics/graph
Content-Type: application/json
Authorization: Bearer {token}

{
  "include_centrality": true,
  "include_communities": true,
  "include_patterns": true,
  "algorithms": ["pagerank", "louvain", "betweenness"],
  "scope": {
    "node_types": ["Concept", "Proposition"],
    "relationship_types": ["EXPRESSES", "RELATES_TO"]
  }
}
```

**Response:**
```json
{
  "success": true,
  "analytics": {
    "centrality": {
      "pagerank": {
        "concept-123": 0.045,
        "concept-456": 0.032
      },
      "betweenness": {
        "concept-123": 0.12,
        "concept-456": 0.08
      }
    },
    "communities": [
      {
        "id": "community-1",
        "nodes": ["concept-123", "concept-456"],
        "modularity": 0.34
      }
    ],
    "patterns": {
      "frequent_subgraphs": [
        {
          "pattern": "Concept-[EXPRESSES]->Proposition",
          "frequency": 245
        }
      ]
    }
  },
  "metadata": {
    "processing_time": 3200,
    "nodes_analyzed": 5000,
    "edges_analyzed": 12000
  }
}
```

### Machine Learning

#### Concept Classification
Classify concepts using trained ML models.

```http
POST /ml/classify
Content-Type: application/json
Authorization: Bearer {token}

{
  "concept_id": "concept-789",
  "concept_name": "Deep Learning",
  "concept_description": "Neural networks with multiple layers",
  "context": {
    "domain": "artificial_intelligence",
    "confidence_threshold": 0.8
  }
}
```

**Response:**
```json
{
  "success": true,
  "classification": {
    "predicted_type": "AI_Algorithm",
    "confidence": 0.92,
    "alternatives": [
      {
        "type": "Machine_Learning",
        "confidence": 0.87
      }
    ]
  },
  "features": {
    "text_features": ["neural", "layers", "learning"],
    "embedding_features": [0.1, 0.2, ...],
    "context_features": ["ai_domain", "technical_concept"]
  }
}
```

#### Relationship Prediction
Predict missing relationships between concepts.

```http
POST /ml/predict_relationships
Content-Type: application/json
Authorization: Bearer {token}

{
  "concept_id": "concept-123",
  "target_concepts": ["concept-456", "concept-789"],
  "relationship_types": ["RELATES_TO", "DEPENDS_ON"],
  "max_predictions": 10
}
```

#### Anomaly Detection
Detect unusual patterns in the knowledge graph.

```http
POST /ml/detect_anomalies
Content-Type: application/json
Authorization: Bearer {token}

{
  "scope": "recent",
  "time_window": "24h",
  "sensitivity": 0.8,
  "anomaly_types": ["orphaned_concepts", "unusual_clusters", "data_quality"]
}
```

### Performance Monitoring

#### System Health
Get current system health and performance metrics.

```http
GET /system/health
Authorization: Bearer {token}
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2025-01-21T10:00:00Z",
  "metrics": {
    "cpu_usage": 45.2,
    "memory_usage": 67.8,
    "disk_usage": 34.1,
    "database_connections": 12,
    "active_queries": 3
  },
  "health_score": 95,
  "alerts": []
}
```

#### Performance Dashboard
Get comprehensive performance analytics.

```http
GET /performance/dashboard
Authorization: Bearer {token}
Query Parameters:
  - time_range: 1h, 24h, 7d, 30d
  - metrics: cpu,memory,queries,cache
  - format: json, csv
```

#### Query Performance
Get query performance statistics.

```http
GET /performance/queries
Authorization: Bearer {token}
Query Parameters:
  - slow_queries: true/false
  - threshold: response time in ms
  - limit: number of results
```

### Configuration

#### Query Optimization
Configure query optimization settings.

```http
POST /config/optimization
Content-Type: application/json
Authorization: Bearer {token}

{
  "cache_enabled": true,
  "cache_ttl": 3600,
  "optimization_level": "aggressive",
  "index_recommendations": true
}
```

#### Semantic Configuration
Configure semantic search parameters.

```http
POST /config/semantic
Content-Type: application/json
Authorization: Bearer {token}

{
  "embedding_model": "all-MiniLM-L6-v2",
  "similarity_threshold": 0.7,
  "max_results": 20,
  "clustering_enabled": true
}
```

## Error Handling

### Error Response Format

```json
{
  "success": false,
  "error": {
    "code": "INVALID_QUERY",
    "message": "Query syntax error at position 15",
    "details": {
      "position": 15,
      "expected": "WHERE clause",
      "received": "LIMIT clause"
    },
    "timestamp": "2025-01-21T10:00:00Z",
    "request_id": "req-123456"
  }
}
```

### Error Codes

| Code | HTTP Status | Description |
|------|-------------|-------------|
| `INVALID_TOKEN` | 401 | Invalid or expired authentication token |
| `INSUFFICIENT_PERMISSIONS` | 403 | User lacks required permissions |
| `INVALID_QUERY` | 400 | Query syntax or semantic error |
| `RESOURCE_NOT_FOUND` | 404 | Requested resource does not exist |
| `RATE_LIMIT_EXCEEDED` | 429 | Request rate limit exceeded |
| `SERVER_ERROR` | 500 | Internal server error |
| `SERVICE_UNAVAILABLE` | 503 | Service temporarily unavailable |

## Rate Limiting

API requests are rate limited per authentication token:

- **Standard**: 1000 requests per 15 minutes
- **Premium**: 5000 requests per 15 minutes
- **Enterprise**: 10000 requests per 15 minutes

Rate limit headers are included in all responses:

```http
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 742
X-RateLimit-Reset: 1642781400
```

## Pagination

Large result sets are paginated using cursor-based pagination:

```http
POST /execute_kip
{
  "query": "FIND Concept",
  "pagination": {
    "limit": 100,
    "cursor": "eyJpZCI6ImNvbmNlcHQtMTIzIn0="
  }
}
```

**Response with pagination:**
```json
{
  "success": true,
  "results": [...],
  "pagination": {
    "has_more": true,
    "next_cursor": "eyJpZCI6ImNvbmNlcHQtMjIzIn0=",
    "total_count": 5000
  }
}
```

## Webhooks

Configure webhooks to receive real-time notifications:

```http
POST /webhooks
Content-Type: application/json
Authorization: Bearer {token}

{
  "url": "https://your-app.com/webhooks/kip",
  "events": ["concept.created", "query.completed", "anomaly.detected"],
  "secret": "your-webhook-secret"
}
```

## SDKs and Client Libraries

Official SDKs are available for:

- **JavaScript/Node.js**: `npm install @kip/sdk`
- **Python**: `pip install kip-sdk`
- **Java**: `implementation 'com.kip:kip-sdk:1.0.0'`
- **Go**: `go get github.com/kip/go-sdk`

## Examples

### Complete Workflow Example

```javascript
const KIP = require('@kip/sdk');

const client = new KIP({
  apiKey: 'your-kip-token',
  baseURL: 'https://api.kip.dev/v1'
});

// 1. Create a concept
const concept = await client.execute({
  query: "UPSERT Concept {name: 'Quantum Computing', type: 'Technology'}"
});

// 2. Perform semantic search
const similar = await client.semantic.search({
  query: 'quantum computing applications',
  limit: 5
});

// 3. Run analytics
const analytics = await client.analytics.graph({
  include_centrality: true,
  include_communities: true
});

// 4. Get predictions
const predictions = await client.ml.predictRelationships({
  concept_id: concept.id,
  max_predictions: 10
});
```

## Support

- **Documentation**: https://docs.kip.dev
- **API Status**: https://status.kip.dev
- **Community**: https://discord.gg/kip
- **Support**: support@kip.dev