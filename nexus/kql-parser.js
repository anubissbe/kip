/**
 * KQL (Knowledge Query Language) Parser
 * Implements ldclabs/KIP protocol query syntax with CURSOR-based pagination
 */

import crypto from 'crypto';

export class KQLParser {
  constructor() {
    this.operators = {
      FIND: this.parseFindClause.bind(this),
      WHERE: this.parseWhereClause.bind(this),
      FILTER: this.parseFilterClause.bind(this),
      OPTIONAL: this.parseOptionalClause.bind(this),
      UNION: this.parseUnionClause.bind(this),
      NOT: this.parseNotClause.bind(this),
      GROUP: this.parseGroupByClause.bind(this),
      AGGREGATE: this.parseAggregateClause.bind(this),
      LIMIT: this.parseLimitClause.bind(this),
      CURSOR: this.parseCursorClause.bind(this)
    };
    // Encryption key for cursor security (use env var in production)
    this.encryptionKey = process.env.KIP_CURSOR_KEY || 'default-cursor-key-32-chars!!!';
  }

  /**
   * Parse KQL query into executable AST
   * @param {string} query - KQL query string
   * @returns {Object} Abstract Syntax Tree
   */
  parse(query) {
    const tokens = this.tokenize(query);
    const ast = this.buildAST(tokens);
    return ast;
  }

  /**
   * Tokenize query string into structured tokens
   */
  tokenize(query) {
    const tokens = [];
    const patterns = {
      KEYWORD: /^(FIND|WHERE|FILTER|OPTIONAL|UNION|NOT|GROUP|BY|AGGREGATE|LIMIT|CURSOR)\b/i,
      FUNCTION: /^(COUNT|SUM|AVG|MIN|MAX|DISTINCT)\b/i,
      IDENTIFIER: /^[a-zA-Z_][\w]*/,
      STRING: /^'([^']*)'/,
      NUMBER: /^\d+/,
      OPERATOR: /^(=|!=|<|>|<=|>=|CONTAINS)/i,
      COMMA: /^,/,
      LPAREN: /^\(/,
      RPAREN: /^\)/,
      LBRACE: /^\{/,
      RBRACE: /^\}/,
      DOT: /^\./,
      ASTERISK: /^\*/,
      WHITESPACE: /^\s+/
    };

    let remaining = query.trim();
    while (remaining.length > 0) {
      let matched = false;

      for (const [type, pattern] of Object.entries(patterns)) {
        const match = remaining.match(pattern);
        if (match) {
          if (type !== 'WHITESPACE') {
            tokens.push({
              type,
              value: match[1] || match[0],
              raw: match[0]
            });
          }
          remaining = remaining.slice(match[0].length);
          matched = true;
          break;
        }
      }

      if (!matched) {
        throw new Error(`Invalid KQL syntax near: ${remaining.slice(0, 20)}`);
      }
    }

    return tokens;
  }

  /**
   * Build Abstract Syntax Tree from tokens
   */
  buildAST(tokens) {
    const ast = {
      type: 'Query',
      clauses: []
    };

    let i = 0;
    while (i < tokens.length) {
      const token = tokens[i];

      if (token.type === 'KEYWORD') {
        const clause = this.parseClause(tokens, i);
        ast.clauses.push(clause);
        i = clause.nextIndex;
      } else {
        i++;
      }
    }

    return ast;
  }

  /**
   * Parse field path with dot notation support
   * Handles: field, field.subfield, field.subfield.subsub
   */
  parseFieldPath(tokens, startIndex) {
    let i = startIndex;
    const pathParts = [];

    if (tokens[i] && tokens[i].type === 'IDENTIFIER') {
      pathParts.push(tokens[i].value);
      i++;

      // Parse dot notation: field.subfield.subsub
      while (i < tokens.length &&
             tokens[i].type === 'DOT' &&
             i + 1 < tokens.length &&
             tokens[i + 1].type === 'IDENTIFIER') {
        i++; // Skip DOT
        pathParts.push(tokens[i].value);
        i++; // Move to next token
      }
    }

    return {
      path: pathParts.join('.'),
      pathParts,
      nextIndex: i
    };
  }

  /**
   * Parse individual clause based on keyword
   */
  parseClause(tokens, startIndex) {
    const keyword = tokens[startIndex].value.toUpperCase();

    switch (keyword) {
      case 'FIND':
        return this.parseFindClause(tokens, startIndex);
      case 'WHERE':
        return this.parseWhereClause(tokens, startIndex);
      case 'FILTER':
        return this.parseFilterClause(tokens, startIndex);
      case 'OPTIONAL':
        return this.parseOptionalClause(tokens, startIndex);
      case 'UNION':
        return this.parseUnionClause(tokens, startIndex);
      case 'NOT':
        return this.parseNotClause(tokens, startIndex);
      case 'GROUP':
        return this.parseGroupByClause(tokens, startIndex);
      case 'AGGREGATE':
        return this.parseAggregateClause(tokens, startIndex);
      case 'LIMIT':
        return this.parseLimitClause(tokens, startIndex);
      case 'CURSOR':
        return this.parseCursorClause(tokens, startIndex);
      default:
        throw new Error(`Unknown clause: ${keyword}`);
    }
  }

  /**
   * Parse FIND clause
   * FIND <output> | FIND * | FIND Concept | FIND field1, field2.subfield
   */
  parseFindClause(tokens, startIndex) {
    let i = startIndex + 1;
    const outputs = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'IDENTIFIER') {
        // Handle dot notation in SELECT fields
        const field = this.parseFieldPath(tokens, i);
        outputs.push({
          type: 'Output',
          value: field.path
        });
        i = field.nextIndex;

        // Skip comma if present
        if (i < tokens.length && tokens[i].type === 'COMMA') {
          i++;
        }
      } else if (tokens[i].value === '*') {
        outputs.push({
          type: 'Output',
          value: tokens[i].value
        });
        i++;
      } else {
        i++;
      }
    }

    return {
      type: 'FindClause',
      outputs,
      nextIndex: i
    };
  }

  /**
   * Parse WHERE clause
   * WHERE <pattern>
   */
  parseWhereClause(tokens, startIndex) {
    let i = startIndex + 1;
    const patterns = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'IDENTIFIER') {
        // Parse pattern: field = 'value' or field.subfield = 'value'
        const field = this.parseFieldPath(tokens, i);
        i = field.nextIndex;

        if (tokens[i] && tokens[i].type === 'OPERATOR') {
          const operator = tokens[i].value;
          i++;

          if (tokens[i] && tokens[i].type === 'STRING') {
            patterns.push({
              type: 'Pattern',
              field: field.path,
              operator,
              value: tokens[i].value
            });
          }
        }
      }
      i++;
    }

    return {
      type: 'WhereClause',
      patterns,
      nextIndex: i
    };
  }

  /**
   * Parse FILTER clause
   * FILTER <expression>
   */
  parseFilterClause(tokens, startIndex) {
    let i = startIndex + 1;
    const expressions = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'IDENTIFIER') {
        // Parse pattern: field = 'value' or field.subfield = 'value'
        const field = this.parseFieldPath(tokens, i);
        i = field.nextIndex;

        if (tokens[i] && tokens[i].type === 'OPERATOR') {
          const operator = tokens[i].value;
          i++;

          if (tokens[i] && tokens[i].type === 'STRING') {
            expressions.push({
              type: 'FilterExpression',
              field: field.path,
              operator,
              value: tokens[i].value
            });
          }
        }
      }
      i++;
    }

    return {
      type: 'FilterClause',
      expressions,
      nextIndex: i
    };
  }

  /**
   * Parse OPTIONAL clause
   */
  parseOptionalClause(tokens, startIndex) {
    let i = startIndex + 1;
    const patterns = [];

    // Similar to WHERE clause but marked as optional
    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'IDENTIFIER') {
        patterns.push({
          type: 'OptionalPattern',
          value: tokens[i].value
        });
      }
      i++;
    }

    return {
      type: 'OptionalClause',
      patterns,
      nextIndex: i
    };
  }

  /**
   * Parse UNION clause
   */
  parseUnionClause(tokens, startIndex) {
    // UNION combines multiple queries
    return {
      type: 'UnionClause',
      nextIndex: startIndex + 1
    };
  }

  /**
   * Parse NOT clause
   */
  parseNotClause(tokens, startIndex) {
    let i = startIndex + 1;
    const patterns = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'IDENTIFIER') {
        patterns.push({
          type: 'NotPattern',
          value: tokens[i].value
        });
      }
      i++;
    }

    return {
      type: 'NotClause',
      patterns,
      nextIndex: i
    };
  }

  /**
   * Parse LIMIT clause
   * LIMIT <number>
   */
  parseLimitClause(tokens, startIndex) {
    let i = startIndex + 1;
    let limit = 100; // default

    if (i < tokens.length && tokens[i].type === 'NUMBER') {
      limit = parseInt(tokens[i].value, 10);
      if (isNaN(limit) || limit < 1) {
        limit = 100;
      }
      // Cap at reasonable maximum
      limit = Math.min(limit, 1000);
      i++;
    }

    return {
      type: 'LimitClause',
      limit,
      nextIndex: i
    };
  }

  /**
   * Parse CURSOR clause
   * CURSOR '<cursor-token>'
   */
  parseCursorClause(tokens, startIndex) {
    let i = startIndex + 1;
    let cursor = null;

    if (i < tokens.length && tokens[i].type === 'STRING') {
      cursor = tokens[i].value;
      i++;
    }

    return {
      type: 'CursorClause',
      cursor,
      nextIndex: i
    };
  }

  /**
   * Parse GROUP BY clause
   * GROUP BY <field1>, <field2>, ...
   */
  parseGroupByClause(tokens, startIndex) {
    let i = startIndex + 1;
    const groupByFields = [];

    // Expect 'BY' keyword after 'GROUP'
    if (i < tokens.length && tokens[i].value.toUpperCase() === 'BY') {
      i++;

      // Parse comma-separated field list
      while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
        if (tokens[i].type === 'IDENTIFIER') {
          // Handle dot notation in GROUP BY fields
          const field = this.parseFieldPath(tokens, i);
          groupByFields.push({
            type: 'GroupField',
            field: field.path
          });
          i = field.nextIndex;

          // Skip comma if present
          if (i < tokens.length && tokens[i].type === 'COMMA') {
            i++;
          }
        } else {
          i++;
        }
      }
    }

    return {
      type: 'GroupByClause',
      fields: groupByFields,
      nextIndex: i
    };
  }

  /**
   * Parse AGGREGATE clause
   * AGGREGATE COUNT(*), SUM(field), AVG(field), MIN(field), MAX(field)
   */
  parseAggregateClause(tokens, startIndex) {
    let i = startIndex + 1;
    const aggregateFunctions = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'FUNCTION' || tokens[i].type === 'IDENTIFIER') {
        const functionName = tokens[i].value.toUpperCase();
        i++;

        // Expect opening parenthesis
        if (i < tokens.length && tokens[i].type === 'LPAREN') {
          i++;

          let argument = null;
          // Parse function argument (field name with dot notation or *)
          if (i < tokens.length) {
            if (tokens[i].type === 'ASTERISK' || tokens[i].value === '*') {
              argument = '*';
              i++;
            } else if (tokens[i].type === 'IDENTIFIER') {
              // Handle dot notation in function arguments
              const field = this.parseFieldPath(tokens, i);
              argument = field.path;
              i = field.nextIndex;
            }
          }

          // Expect closing parenthesis
          if (i < tokens.length && tokens[i].type === 'RPAREN') {
            i++;

            aggregateFunctions.push({
              type: 'AggregateFunction',
              function: functionName,
              argument: argument,
              alias: `${functionName.toLowerCase()}_${argument === '*' ? 'all' : (argument ? argument.replace(/\./g, '_') : 'value')}`
            });
          }

          // Skip comma if present
          if (i < tokens.length && tokens[i].type === 'COMMA') {
            i++;
          }
        }
      } else {
        i++;
      }
    }

    return {
      type: 'AggregateClause',
      functions: aggregateFunctions,
      nextIndex: i
    };
  }

  /**
   * Decode cursor token (instance method)
   * @param {string} cursorToken - Base64 encoded cursor token
   * @returns {Object|null} Decoded cursor data or null if invalid
   */
  decodeCursor(cursorToken) {
    if (!this.cursorManager) {
      this.cursorManager = new CursorManager(this.encryptionKey);
    }
    return this.cursorManager.decodeCursor(cursorToken);
  }

  /**
   * Create cursor from results (instance method)
   * @param {Array} results - Query results
   * @param {Object} queryInfo - Query metadata
   * @param {number} limit - Query limit
   * @returns {string|null} Cursor token or null if no more results
   */
  createCursor(results, queryInfo, limit) {
    if (!this.cursorManager) {
      this.cursorManager = new CursorManager(this.encryptionKey);
    }
    return this.cursorManager.createCursor(results, queryInfo, limit);
  }

  /**
   * Convert field path to Neo4j property access
   * Handles: field -> n.field, field.subfield -> n.field.subfield
   */
  fieldToCypherProperty(field, nodeVar = 'n') {
    if (field.includes('.')) {
      // For nested properties, use direct property access syntax
      return `${nodeVar}.${field}`;
    } else {
      // Simple property access
      return `${nodeVar}.${field}`;
    }
  }

  /**
   * Generate parameter name for field path
   * Handles: field -> field, field.subfield -> field_subfield
   */
  fieldToParameterName(field, prefix = '') {
    const paramName = field.replace(/\./g, '_');
    return prefix ? `${prefix}_${paramName}` : paramName;
  }

  /**
   * Convert AST to Neo4j Cypher query with cursor-based pagination
   */
  toCypher(ast) {
    let cypher = '';
    let params = {};
    let whereConditions = [];
    let filterConditions = [];
    let optionalMatches = [];
    let notConditions = [];
    let groupByFields = [];
    let aggregateFunctions = [];
    let limit = 100;
    let cursor = null;
    let cursorData = null;
    let hasAggregation = false;
    let findClause = null;

    // Extract pagination clauses first
    for (const clause of ast.clauses) {
      if (clause.type === 'LimitClause') {
        limit = clause.limit;
      } else if (clause.type === 'CursorClause' && clause.cursor) {
        cursor = clause.cursor;
        cursorData = this.decodeCursor(cursor);
      }
    }

    for (const clause of ast.clauses) {
      switch (clause.type) {
        case 'FindClause':
          findClause = clause;
          if (clause.outputs[0]?.value === '*') {
            cypher = 'MATCH (n:Concept) ';
          } else {
            // Check if first output looks like a node label or a field
            const firstOutput = clause.outputs[0]?.value || 'Concept';
            if (firstOutput.includes('.') || clause.outputs.length > 1) {
              // Multiple fields or dot notation - this is a SELECT projection
              cypher = 'MATCH (n:Concept) ';
            } else if (firstOutput === 'Concept') {
              // Direct Concept query
              cypher = 'MATCH (n:Concept) ';
            } else {
              // Convert label to type filter on Concept
              cypher = 'MATCH (n:Concept) ';
              whereConditions.push('n.type = $find_type');
              params.find_type = firstOutput;
            }
          }
          break;

        case 'WhereClause':
          for (const pattern of clause.patterns) {
            const paramName = this.fieldToParameterName(pattern.field);

            if (pattern.field.includes('.')) {
              // Dot notation field - query via Propositions
              if (pattern.operator === '=') {
                optionalMatches.push(`MATCH (n)-[:HAS_PROPOSITION]->(p:Proposition {predicate: '${pattern.field}', object: '${pattern.value}'})`);
              } else if (pattern.operator.toUpperCase() === 'CONTAINS') {
                optionalMatches.push(`MATCH (n)-[:HAS_PROPOSITION]->(p:Proposition {predicate: '${pattern.field}'}) WHERE toLower(p.object) CONTAINS toLower('${pattern.value}')`);
              }
            } else {
              // Regular field - query directly on node
              const cypherProperty = this.fieldToCypherProperty(pattern.field);

              if (pattern.operator === '=') {
                whereConditions.push(`${cypherProperty} = $${paramName}`);
                params[paramName] = pattern.value;
              } else if (pattern.operator.toUpperCase() === 'CONTAINS') {
                whereConditions.push(`toLower(${cypherProperty}) CONTAINS toLower($${paramName})`);
                params[paramName] = pattern.value;
              }
            }
          }
          break;

        case 'FilterClause':
          for (const expr of clause.expressions) {
            const paramName = this.fieldToParameterName(expr.field, 'filter');

            if (expr.field.includes('.')) {
              // Dot notation field - query via Propositions
              if (expr.operator === '!=') {
                optionalMatches.push(`OPTIONAL MATCH (n)-[:HAS_PROPOSITION]->(p:Proposition {predicate: '${expr.field}'}) WHERE p.object <> '${expr.value}' OR p IS NULL`);
              } else if (expr.operator === '=') {
                optionalMatches.push(`MATCH (n)-[:HAS_PROPOSITION]->(p:Proposition {predicate: '${expr.field}', object: '${expr.value}'})`);
              } else if (expr.operator.toUpperCase() === 'CONTAINS') {
                optionalMatches.push(`MATCH (n)-[:HAS_PROPOSITION]->(p:Proposition {predicate: '${expr.field}'}) WHERE toLower(p.object) CONTAINS toLower('${expr.value}')`);
              }
            } else {
              // Regular field - query directly on node
              const cypherProperty = this.fieldToCypherProperty(expr.field);

              if (expr.operator === '!=') {
                filterConditions.push(`${cypherProperty} <> $${paramName}`);
                params[paramName] = expr.value;
              } else {
                filterConditions.push(`${cypherProperty} ${expr.operator} $${paramName}`);
                params[paramName] = expr.value;
              }
            }
          }
          break;

        case 'OptionalClause':
          for (const pattern of clause.patterns) {
            optionalMatches.push(`OPTIONAL MATCH (n)-[:HAS_PROPOSITION]->(p:Proposition {name: '${pattern.value}'})`);
          }
          break;

        case 'NotClause':
          for (const pattern of clause.patterns) {
            notConditions.push(`NOT exists(n.${pattern.value})`);
          }
          break;

        case 'GroupByClause':
          for (const field of clause.fields) {
            const cypherProperty = this.fieldToCypherProperty(field.field);
            const alias = field.field.replace(/\./g, '_');
            groupByFields.push(`${cypherProperty} as ${alias}`);
          }
          hasAggregation = true;
          break;

        case 'AggregateClause':
          for (const func of clause.functions) {
            aggregateFunctions.push(func); // Store original function objects
          }
          hasAggregation = true;
          break;
      }
    }

    // Apply cursor-based pagination conditions
    if (cursorData && cursorData.last_id) {
      whereConditions.push('id(n) > $cursor_last_id');
      params.cursor_last_id = cursorData.last_id;
    }

    // Build WHERE clause
    if (whereConditions.length > 0) {
      cypher += 'WHERE ' + whereConditions.join(' AND ') + ' ';
    }

    // Add OPTIONAL matches
    cypher += optionalMatches.join(' ');

    // Add filter conditions to WHERE
    if (filterConditions.length > 0) {
      if (whereConditions.length > 0) {
        cypher += 'AND ' + filterConditions.join(' AND ') + ' ';
      } else {
        cypher += 'WHERE ' + filterConditions.join(' AND ') + ' ';
      }
    }

    // Add NOT conditions
    if (notConditions.length > 0) {
      if (whereConditions.length > 0 || filterConditions.length > 0) {
        cypher += 'AND ' + notConditions.join(' AND ') + ' ';
      } else {
        cypher += 'WHERE ' + notConditions.join(' AND ') + ' ';
      }
    }

    // Handle aggregation vs non-aggregation queries differently
    if (hasAggregation) {
      // Collect all fields referenced in aggregation functions
      const aggregateFields = [];
      for (const func of aggregateFunctions) {
        if (func.argument && func.argument !== '*') {
          const cypherProperty = this.fieldToCypherProperty(func.argument);
          const alias = func.argument.replace(/\./g, '_');
          aggregateFields.push(`${cypherProperty} as ${alias}`);
        }
      }

      // Build WITH clause
      if (groupByFields.length > 0) {
        const allFields = [...groupByFields, ...aggregateFields];
        cypher += `WITH ${[...new Set(allFields)].join(', ')} `;
      } else if (aggregateFields.length > 0) {
        cypher += `WITH ${[...new Set(aggregateFields)].join(', ')} `;
      } else {
        cypher += 'WITH 1 as dummy '; // For global aggregation with only COUNT(*)
      }

      // Build RETURN clause with aggregation functions
      const returnParts = [];
      if (groupByFields.length > 0) {
        returnParts.push(...groupByFields.map(field => field.split(' as ')[1]));
      }
      if (aggregateFunctions.length > 0) {
        returnParts.push(...aggregateFunctions.map(func => this.buildAggregateFunction(func)));
      } else {
        returnParts.push('count(*) as count_all');
      }

      cypher += `RETURN ${returnParts.join(', ')} `;

      // Apply limit for aggregated results
      if (limit && limit < 1000) {
        cypher += `LIMIT ${limit}`;
      }
    } else {
      // Standard non-aggregated query
      // Add ordering for consistent pagination
      if (optionalMatches.length > 0) {
        cypher += 'WITH n, collect(p) as propositions, id(n) as node_id ORDER BY node_id ';
      } else {
        cypher += 'WITH n, id(n) as node_id ORDER BY node_id ';
      }

      // Handle custom SELECT projections
      if (findClause && findClause.outputs.length > 0 &&
          findClause.outputs[0]?.value !== '*' &&
          (findClause.outputs[0]?.value.includes('.') || findClause.outputs.length > 1)) {
        // Custom projection with specific fields
        const projectionFields = [];
        for (const output of findClause.outputs) {
          if (output.value !== '*') {
            const cypherProperty = this.fieldToCypherProperty(output.value);
            const alias = output.value.replace(/\./g, '_');
            projectionFields.push(`${cypherProperty} as ${alias}`);
          }
        }
        cypher += `RETURN ${projectionFields.join(', ')}, node_id LIMIT ${limit + 1}`;
      } else {
        // Default return with full node
        if (optionalMatches.length > 0) {
          cypher += `RETURN n, propositions, node_id LIMIT ${limit + 1}`;
        } else {
          cypher += `RETURN n, [] as propositions, node_id LIMIT ${limit + 1}`;
        }
      }
    }

    return { cypher, params, limit, cursor, cursorData, hasAggregation };
  }

  /**
   * Build aggregation function for Cypher query
   * @param {Object} func - Aggregate function specification
   * @returns {string} Cypher aggregation expression
   */
  buildAggregateFunction(func) {
    const { function: funcName, argument, alias } = func;

    // Convert field references to proper Cypher syntax
    const cypherArgument = argument === '*' ? '*' : this.fieldToCypherProperty(argument);

    switch (funcName) {
      case 'COUNT':
        if (argument === '*') {
          return `count(*) as ${alias}`;
        } else {
          return `count(${cypherArgument}) as ${alias}`;
        }
      case 'SUM':
        return `sum(toFloat(${cypherArgument})) as ${alias}`;
      case 'AVG':
        return `avg(toFloat(${cypherArgument})) as ${alias}`;
      case 'MIN':
        return `min(${cypherArgument}) as ${alias}`;
      case 'MAX':
        return `max(${cypherArgument}) as ${alias}`;
      case 'DISTINCT':
        if (argument === '*') {
          return `count(distinct *) as ${alias}`;
        } else {
          return `count(distinct ${cypherArgument}) as ${alias}`;
        }
      default:
        throw new Error(`Unsupported aggregation function: ${funcName}`);
    }
  }
}

/**
 * Check if query is legacy format for backward compatibility
 */
export function isLegacyQuery(query) {
  // Simple FIND Label WHERE field = 'value' format (ONLY simple fields, not dot notation)
  const legacyPattern = /^FIND\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*'([^']+)'$/i;
  const match = query.trim().match(legacyPattern);

  // Only treat as legacy if it matches AND the field doesn't contain dots
  return match && !match[2].includes('.');
}

/**
 * Convert legacy query to KQL format
 */
export function convertLegacyToKQL(query) {
  const match = query.match(/^FIND\s+(\w+)\s+WHERE\s+(\w+)\s*=\s*'([^']+)'$/i);
  if (match) {
    const [, label, field, value] = match;
    // Convert to Concept-based query
    return `FIND Concept WHERE type = '${label}' FILTER ${field} = '${value}'`;
  }
  return query;
}

/**
 * Cursor Management Utilities
 */
export class CursorManager {
  constructor(encryptionKey) {
    this.encryptionKey = encryptionKey || 'default-cursor-key-32-chars!!!';
  }

  /**
   * Create a cursor token from query results
   * @param {Array} results - Query results
   * @param {Object} queryInfo - Query metadata for hash generation
   * @param {number} limit - Query limit
   * @returns {string|null} Cursor token or null if no more results
   */
  createCursor(results, queryInfo, limit) {
    if (results.length <= limit) {
      // No more results available
      return null;
    }

    // Get the last result (excluding the extra one used for hasMore detection)
    const lastResult = results[limit - 1];
    const lastId = lastResult.node_id || lastResult.id;

    if (!lastId) {
      return null;
    }

    const cursorData = {
      last_id: lastId,
      offset: (queryInfo.offset || 0) + limit,
      query_hash: this.generateQueryHash(queryInfo),
      timestamp: Date.now()
    };

    return this.encodeCursor(cursorData);
  }

  /**
   * Encode cursor data into a secure token
   * @param {Object} cursorData - Cursor data to encode
   * @returns {string} Encoded cursor token
   */
  encodeCursor(cursorData) {
    try {
      const jsonData = JSON.stringify(cursorData);
      const encrypted = this.encrypt(jsonData);
      return Buffer.from(encrypted, 'utf8').toString('base64');
    } catch (error) {
      console.error('Cursor encoding error:', error);
      return null;
    }
  }

  /**
   * Decode cursor token back to data
   * @param {string} cursorToken - Base64 encoded cursor token
   * @returns {Object|null} Decoded cursor data or null if invalid
   */
  decodeCursor(cursorToken) {
    try {
      const encrypted = Buffer.from(cursorToken, 'base64').toString('utf8');
      const jsonData = this.decrypt(encrypted);
      const cursorData = JSON.parse(jsonData);

      // Validate cursor age (1 hour max)
      const hourAgo = Date.now() - (60 * 60 * 1000);
      if (cursorData.timestamp < hourAgo) {
        return null; // Expired cursor
      }

      return cursorData;
    } catch (error) {
      console.error('Cursor decoding error:', error);
      return null;
    }
  }

  /**
   * Generate a hash of query components for cursor validation
   * @param {Object} queryInfo - Query metadata
   * @returns {string} Query hash
   */
  generateQueryHash(queryInfo) {
    const hashData = {
      find: queryInfo.find || '',
      where: queryInfo.where || '',
      filter: queryInfo.filter || ''
    };

    return crypto
      .createHash('sha256')
      .update(JSON.stringify(hashData))
      .digest('hex')
      .substring(0, 16); // Truncate for space efficiency
  }

  /**
   * Simple encryption for cursor data
   * @param {string} text - Text to encrypt
   * @returns {string} Encrypted text
   */
  encrypt(text) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
    const iv = crypto.randomBytes(16);

    const cipher = crypto.createCipheriv(algorithm, key, iv);
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return iv.toString('hex') + ':' + encrypted;
  }

  /**
   * Simple decryption for cursor data
   * @param {string} encryptedText - Text to decrypt
   * @returns {string} Decrypted text
   */
  decrypt(encryptedText) {
    const algorithm = 'aes-256-cbc';
    const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);

    const [ivHex, encrypted] = encryptedText.split(':');
    if (!ivHex || !encrypted) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }

  /**
   * Validate cursor against current query
   * @param {Object} cursorData - Decoded cursor data
   * @param {Object} queryInfo - Current query metadata
   * @returns {boolean} True if cursor is valid for this query
   */
  validateCursor(cursorData, queryInfo) {
    if (!cursorData || !cursorData.query_hash) {
      return false;
    }

    const currentHash = this.generateQueryHash(queryInfo);
    return cursorData.query_hash === currentHash;
  }
}