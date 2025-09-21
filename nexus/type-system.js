/**
 * KIP Type System Engine - Phase 6 Implementation
 * Enforces strict type validation for ldclabs/KIP protocol compliance
 */

import { z } from 'zod';
import fs from 'fs';
import path from 'path';

export class TypeSystemEngine {
  constructor() {
    this.schemas = new Map();
    this.typeRegistry = new Map();
    this.validationCache = new Map();
    this.initializeBuiltinTypes();
    this.loadSchemas();
  }

  /**
   * Initialize built-in KIP type definitions
   */
  initializeBuiltinTypes() {
    // Core Concept schema
    this.registerSchema('Concept', z.object({
      name: z.string().min(1).max(255),
      type: z.string().min(1).max(100),
      id: z.string().uuid().optional(),
      created: z.number().int().positive().optional(),
      updated: z.number().int().positive().optional(),
      _legacy: z.string().optional(),
      _migrated: z.number().int().optional(),
      _originalLabels: z.array(z.string()).optional()
    }));

    // Core Proposition schema
    this.registerSchema('Proposition', z.object({
      predicate: z.string().min(1).max(255),
      object: z.string().min(1).max(10000),
      _conceptName: z.string().min(1).max(255),
      id: z.string().uuid().optional(),
      created: z.number().int().positive().optional(),
      updated: z.number().int().positive().optional(),
      metadata: z.object({
        source: z.string().optional(),
        label: z.string().optional(),
        timestamp: z.string().datetime().optional(),
        confidence: z.number().min(0).max(1).optional(),
        version: z.string().optional()
      }).optional()
    }));

    // KQL Query schema
    this.registerSchema('KQLQuery', z.object({
      query: z.string().min(1).max(10000),
      mode: z.enum(['legacy', 'kql']).optional(),
      version: z.string().optional(),
      timeout: z.number().int().positive().max(60000).optional()
    }));

    // Query Response schema
    this.registerSchema('QueryResponse', z.object({
      ok: z.boolean(),
      data: z.array(z.any()).optional(),
      propositions: z.array(z.any()).optional(),
      pagination: z.object({
        hasMore: z.boolean(),
        cursor: z.string().nullable(),
        limit: z.number().int().positive()
      }).optional(),
      metadata: z.object({
        query_type: z.string(),
        has_aggregation: z.boolean().optional(),
        ast_depth: z.number().int().optional(),
        timestamp: z.string().datetime().optional()
      }).optional(),
      error: z.string().optional()
    }));

    // UPSERT Operation schema
    this.registerSchema('UpsertOperation', z.object({
      label: z.string().min(1).max(100),
      properties: z.record(z.string(), z.union([
        z.string(),
        z.number(),
        z.boolean(),
        z.null()
      ])).refine(data => data.name, {
        message: "Properties must include 'name' field"
      })
    }));

    // Proposition Creation schema
    this.registerSchema('PropositionCreate', z.object({
      subject: z.string().min(1).max(255),
      predicate: z.string().min(1).max(255),
      object: z.union([z.string(), z.number(), z.boolean()]).transform(String),
      metadata: z.object({
        source: z.string().optional(),
        timestamp: z.string().datetime().optional(),
        confidence: z.number().min(0).max(1).optional()
      }).optional()
    }));
  }

  /**
   * Load additional schemas from files
   */
  loadSchemas() {
    const schemasDir = path.join(process.cwd(), 'nexus', 'schemas');
    if (fs.existsSync(schemasDir)) {
      const schemaFiles = fs.readdirSync(schemasDir).filter(f => f.endsWith('.json'));
      for (const file of schemaFiles) {
        try {
          const schemaPath = path.join(schemasDir, file);
          const schemaData = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
          const schemaName = path.basename(file, '.json');
          this.registerJSONSchema(schemaName, schemaData);
        } catch (error) {
          console.warn(`Failed to load schema ${file}:`, error.message);
        }
      }
    }
  }

  /**
   * Register a Zod schema
   */
  registerSchema(name, schema) {
    this.schemas.set(name, {
      type: 'zod',
      schema,
      version: '1.0.0',
      registered: new Date().toISOString()
    });
  }

  /**
   * Register a JSON Schema
   */
  registerJSONSchema(name, jsonSchema) {
    // Convert JSON Schema to Zod (simplified version)
    const zodSchema = this.jsonSchemaToZod(jsonSchema);
    this.schemas.set(name, {
      type: 'json',
      schema: zodSchema,
      jsonSchema,
      version: jsonSchema.version || '1.0.0',
      registered: new Date().toISOString()
    });
  }

  /**
   * Convert JSON Schema to Zod schema (basic implementation)
   */
  jsonSchemaToZod(jsonSchema) {
    if (jsonSchema.type === 'object') {
      const shape = {};
      for (const [key, prop] of Object.entries(jsonSchema.properties || {})) {
        shape[key] = this.jsonPropertyToZod(prop);
        if (!jsonSchema.required?.includes(key)) {
          shape[key] = shape[key].optional();
        }
      }
      return z.object(shape);
    }
    return z.any(); // Fallback for complex schemas
  }

  /**
   * Convert JSON Schema property to Zod type
   */
  jsonPropertyToZod(prop) {
    switch (prop.type) {
      case 'string':
        let stringSchema = z.string();
        if (prop.minLength) stringSchema = stringSchema.min(prop.minLength);
        if (prop.maxLength) stringSchema = stringSchema.max(prop.maxLength);
        if (prop.pattern) stringSchema = stringSchema.regex(new RegExp(prop.pattern));
        if (prop.format === 'email') stringSchema = stringSchema.email();
        if (prop.format === 'uuid') stringSchema = stringSchema.uuid();
        if (prop.format === 'date-time') stringSchema = stringSchema.datetime();
        return stringSchema;
      case 'number':
      case 'integer':
        let numberSchema = prop.type === 'integer' ? z.number().int() : z.number();
        if (prop.minimum !== undefined) numberSchema = numberSchema.min(prop.minimum);
        if (prop.maximum !== undefined) numberSchema = numberSchema.max(prop.maximum);
        return numberSchema;
      case 'boolean':
        return z.boolean();
      case 'array':
        return z.array(prop.items ? this.jsonPropertyToZod(prop.items) : z.any());
      case 'object':
        return this.jsonSchemaToZod(prop);
      default:
        return z.any();
    }
  }

  /**
   * Validate data against a schema
   */
  validate(schemaName, data, options = {}) {
    const cacheKey = `${schemaName}:${JSON.stringify(data)}`;

    if (!options.skipCache && this.validationCache.has(cacheKey)) {
      return this.validationCache.get(cacheKey);
    }

    const schemaInfo = this.schemas.get(schemaName);
    if (!schemaInfo) {
      throw new TypeValidationError(`Schema '${schemaName}' not found`, {
        availableSchemas: Array.from(this.schemas.keys())
      });
    }

    try {
      const result = schemaInfo.schema.parse(data);
      const validation = {
        success: true,
        data: result,
        errors: [],
        schema: schemaName,
        timestamp: new Date().toISOString()
      };

      if (!options.skipCache) {
        this.validationCache.set(cacheKey, validation);
      }

      return validation;
    } catch (error) {
      const validation = {
        success: false,
        data: null,
        errors: this.formatZodErrors(error),
        schema: schemaName,
        timestamp: new Date().toISOString()
      };

      if (!options.skipCache) {
        this.validationCache.set(cacheKey, validation);
      }

      return validation;
    }
  }

  /**
   * Format Zod validation errors
   */
  formatZodErrors(zodError) {
    if (zodError.errors) {
      return zodError.errors.map(err => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
        expected: err.expected || null,
        received: err.received || null
      }));
    }
    return [{ message: zodError.message || 'Validation failed' }];
  }

  /**
   * Validate KQL query syntax and types
   */
  validateKQLQuery(query) {
    // First validate basic structure
    const basicValidation = this.validate('KQLQuery', { query });
    if (!basicValidation.success) {
      return basicValidation;
    }

    // Parse and validate KQL-specific syntax
    try {
      const kqlValidation = this.validateKQLSyntax(query);
      return {
        success: true,
        data: { query, ...kqlValidation },
        errors: [],
        schema: 'KQLQuery',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      return {
        success: false,
        data: null,
        errors: [{ message: error.message, type: 'KQL_SYNTAX_ERROR' }],
        schema: 'KQLQuery',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Validate KQL syntax and semantics
   */
  validateKQLSyntax(query) {
    const patterns = {
      FIND: /^FIND\s+(\*|[\w.]+(?:\s*,\s*[\w.]+)*)/i,
      WHERE: /WHERE\s+([\w.]+)\s*(=|!=|<|>|<=|>=|CONTAINS)\s*'([^']*)'/i,
      FILTER: /FILTER\s+([\w.]+)\s*(=|!=|<|>|<=|>=|CONTAINS)\s*'([^']*)'/i,
      LIMIT: /LIMIT\s+(\d+)/i,
      CURSOR: /CURSOR\s+'([^']+)'/i,
      AGGREGATE: /AGGREGATE\s+(COUNT|SUM|AVG|MIN|MAX|DISTINCT)\s*\(\s*(\*|[\w.]+)\s*\)/i,
      GROUP: /GROUP\s+BY\s+([\w.]+(?:\s*,\s*[\w.]+)*)/i
    };

    const validation = {
      clauses: [],
      fields: [],
      operators: [],
      hasAggregation: false,
      complexityScore: 0
    };

    // Check for valid clause structure
    for (const [clauseType, pattern] of Object.entries(patterns)) {
      const match = query.match(pattern);
      if (match) {
        validation.clauses.push(clauseType);

        if (clauseType === 'FIND') {
          validation.fields.push(...this.extractFields(match[1]));
        } else if (clauseType === 'WHERE' || clauseType === 'FILTER') {
          validation.fields.push(match[1]);
          validation.operators.push(match[2]);
        } else if (clauseType === 'AGGREGATE') {
          validation.hasAggregation = true;
          validation.fields.push(match[2]);
        }
      }
    }

    // Calculate complexity score
    validation.complexityScore = this.calculateQueryComplexity(validation);

    // Validate field names
    for (const field of validation.fields) {
      if (!this.isValidFieldName(field)) {
        throw new Error(`Invalid field name: ${field}`);
      }
    }

    return validation;
  }

  /**
   * Extract fields from FIND clause
   */
  extractFields(fieldString) {
    if (fieldString === '*') return ['*'];
    return fieldString.split(',').map(f => f.trim()).filter(f => f);
  }

  /**
   * Validate field name format
   */
  isValidFieldName(field) {
    if (field === '*') return true;
    // Allow: word, word.word, word.word.word
    return /^[\w]+(?:\.[\w]+)*$/.test(field);
  }

  /**
   * Calculate query complexity score
   */
  calculateQueryComplexity(validation) {
    let score = 0;
    score += validation.clauses.length * 2;
    score += validation.fields.length;
    score += validation.operators.length;
    if (validation.hasAggregation) score += 5;
    return score;
  }

  /**
   * Validate UPSERT operation
   */
  validateUpsert(label, properties) {
    return this.validate('UpsertOperation', { label, properties });
  }

  /**
   * Validate Proposition creation
   */
  validateProposition(propositionData) {
    return this.validate('PropositionCreate', propositionData);
  }

  /**
   * Validate query response structure
   */
  validateResponse(responseData) {
    return this.validate('QueryResponse', responseData);
  }

  /**
   * Type coercion and conversion
   */
  coerceTypes(data, schemaName) {
    const schemaInfo = this.schemas.get(schemaName);
    if (!schemaInfo) {
      return { success: false, error: `Schema '${schemaName}' not found` };
    }

    try {
      // Apply type coercion
      const coerced = this.applyTypeCoercion(data, schemaInfo.schema);
      return { success: true, data: coerced };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Apply basic type coercion
   */
  applyTypeCoercion(data, schema) {
    // Basic coercion for common cases
    if (typeof data === 'object' && data !== null) {
      const coerced = {};
      for (const [key, value] of Object.entries(data)) {
        // Convert string numbers to numbers where expected
        if (typeof value === 'string' && /^\d+$/.test(value)) {
          const numValue = parseInt(value, 10);
          if (!isNaN(numValue)) {
            coerced[key] = numValue;
            continue;
          }
        }
        // Convert string booleans
        if (value === 'true') coerced[key] = true;
        else if (value === 'false') coerced[key] = false;
        else coerced[key] = value;
      }
      return coerced;
    }
    return data;
  }

  /**
   * Get schema information
   */
  getSchema(name) {
    return this.schemas.get(name);
  }

  /**
   * List all registered schemas
   */
  listSchemas() {
    return Array.from(this.schemas.entries()).map(([name, info]) => ({
      name,
      type: info.type,
      version: info.version,
      registered: info.registered
    }));
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return {
      size: this.validationCache.size,
      schemas: this.schemas.size,
      types: this.typeRegistry.size
    };
  }
}

/**
 * Custom error class for type validation
 */
export class TypeValidationError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'TypeValidationError';
    this.details = details;
    this.timestamp = new Date().toISOString();
  }
}

/**
 * Type constraint definitions
 */
export const TypeConstraints = {
  // Field length constraints
  FIELD_NAME_MAX_LENGTH: 255,
  FIELD_VALUE_MAX_LENGTH: 10000,
  QUERY_MAX_LENGTH: 10000,

  // Numeric constraints
  MAX_LIMIT: 1000,
  DEFAULT_LIMIT: 100,
  MAX_TIMEOUT: 60000,

  // Pattern constraints
  FIELD_NAME_PATTERN: /^[\w]+(?:\.[\w]+)*$/,
  UUID_PATTERN: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,

  // Validation rules
  REQUIRED_UPSERT_FIELDS: ['name'],
  REQUIRED_PROPOSITION_FIELDS: ['subject', 'predicate', 'object'],

  // Type compatibility matrix
  COMPATIBLE_TYPES: {
    string: ['string', 'number', 'boolean'],
    number: ['number', 'string'],
    boolean: ['boolean', 'string'],
    object: ['object'],
    array: ['array']
  }
};

export default TypeSystemEngine;