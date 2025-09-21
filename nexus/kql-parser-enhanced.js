/**
 * Enhanced KQL (Knowledge Query Language) Parser with Type System Integration
 * Phase 6: Type System Enforcement for ldclabs/KIP protocol compliance
 */

import crypto from 'crypto';
import { TypeSystemEngine, TypeValidationError } from './type-system.js';

export class EnhancedKQLParser {
  constructor(typeSystem = null) {
    this.typeSystem = typeSystem || new TypeSystemEngine();
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

    // Type-aware patterns for enhanced validation
    this.typePatterns = {
      STRING_LITERAL: /^'([^']*)'$/,
      NUMBER_LITERAL: /^\d+(\.\d+)?$/,
      BOOLEAN_LITERAL: /^(true|false)$/i,
      UUID_LITERAL: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      FIELD_PATH: /^[a-zA-Z_][\w]*(?:\.[a-zA-Z_][\w]*)*$/,
      CONCEPT_TYPE: /^[A-Z][A-Za-z0-9_]*$/
    };

    this.encryptionKey = process.env.KIP_CURSOR_KEY || 'default-cursor-key-32-chars!!!';
  }

  /**
   * Parse and validate KQL query with type checking
   * @param {string} query - KQL query string
   * @param {Object} options - Parsing options
   * @returns {Object} Enhanced AST with type information
   */
  parseWithTypeValidation(query, options = {}) {
    // Validate basic query structure
    const queryValidation = this.typeSystem.validateKQLQuery(query);
    if (!queryValidation.success) {
      throw new TypeValidationError('Query validation failed', {
        errors: queryValidation.errors,
        query
      });
    }

    // Parse into AST
    const tokens = this.tokenize(query);
    const ast = this.buildAST(tokens);

    // Enhance AST with type information
    const enhancedAST = this.enhanceASTWithTypes(ast, options);

    // Validate AST semantics
    const semanticValidation = this.validateASTSemantics(enhancedAST);
    if (!semanticValidation.success) {
      throw new TypeValidationError('Semantic validation failed', {
        errors: semanticValidation.errors,
        ast: enhancedAST
      });
    }

    return {
      ...enhancedAST,
      typeValidation: {
        queryValidation,
        semanticValidation,
        typeCompliance: this.calculateTypeCompliance(enhancedAST)
      }
    };
  }

  /**
   * Enhanced tokenization with type detection
   */
  tokenize(query) {
    const tokens = [];
    const patterns = {
      KEYWORD: /^(FIND|WHERE|FILTER|OPTIONAL|UNION|NOT|GROUP|BY|AGGREGATE|LIMIT|CURSOR)\b/i,
      FUNCTION: /^(COUNT|SUM|AVG|MIN|MAX|DISTINCT)\b/i,
      TYPE_LITERAL: /^(string|number|boolean|uuid|concept|proposition)\b/i,
      IDENTIFIER: /^[a-zA-Z_][\w]*/,
      STRING: /^'([^']*)'/,
      NUMBER: /^\d+(\.\d+)?/,
      BOOLEAN: /^(true|false)\b/i,
      UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
      OPERATOR: /^(=|!=|<|>|<=|>=|CONTAINS|MATCHES|IN|NOT_IN)/i,
      COMMA: /^,/,
      LPAREN: /^\(/,
      RPAREN: /^\)/,
      LBRACE: /^\{/,
      RBRACE: /^\}/,
      LBRACKET: /^\[/,
      RBRACKET: /^\]/,
      DOT: /^\./,
      ASTERISK: /^\*/,
      COLON: /^:/,
      SEMICOLON: /^;/,
      WHITESPACE: /^\s+/
    };

    let remaining = query.trim();
    while (remaining.length > 0) {
      let matched = false;

      for (const [type, pattern] of Object.entries(patterns)) {
        const match = remaining.match(pattern);
        if (match) {
          if (type !== 'WHITESPACE') {
            const token = {
              type,
              value: match[1] || match[0],
              raw: match[0],
              position: query.length - remaining.length
            };

            // Add type information for literals
            if (type === 'STRING') {
              token.dataType = 'string';
              token.literalValue = match[1];
            } else if (type === 'NUMBER') {
              token.dataType = match[0].includes('.') ? 'float' : 'integer';
              token.literalValue = parseFloat(match[0]);
            } else if (type === 'BOOLEAN') {
              token.dataType = 'boolean';
              token.literalValue = match[0].toLowerCase() === 'true';
            } else if (type === 'UUID') {
              token.dataType = 'uuid';
              token.literalValue = match[0];
            }

            tokens.push(token);
          }
          remaining = remaining.slice(match[0].length);
          matched = true;
          break;
        }
      }

      if (!matched) {
        throw new TypeValidationError(`Invalid KQL syntax near: ${remaining.slice(0, 20)}`, {
          position: query.length - remaining.length,
          context: remaining.slice(0, 50)
        });
      }
    }

    return tokens;
  }

  /**
   * Build AST with enhanced type analysis
   */
  buildAST(tokens) {
    const ast = {
      type: 'Query',
      clauses: [],
      typeInfo: {
        expectedReturnType: null,
        fieldTypes: new Map(),
        constraints: []
      }
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
   * Enhance AST with type information
   */
  enhanceASTWithTypes(ast, options = {}) {
    const enhanced = { ...ast };

    for (const clause of enhanced.clauses) {
      this.enhanceClauseWithTypes(clause, enhanced.typeInfo, options);
    }

    // Validate type consistency across clauses
    this.validateTypeConsistency(enhanced);

    return enhanced;
  }

  /**
   * Enhance individual clause with type information
   */
  enhanceClauseWithTypes(clause, globalTypeInfo, options) {
    switch (clause.type) {
      case 'FindClause':
        this.enhanceFindClause(clause, globalTypeInfo);
        break;
      case 'WhereClause':
        this.enhanceWhereClause(clause, globalTypeInfo);
        break;
      case 'FilterClause':
        this.enhanceFilterClause(clause, globalTypeInfo);
        break;
      case 'AggregateClause':
        this.enhanceAggregateClause(clause, globalTypeInfo);
        break;
      case 'LimitClause':
        this.enhanceLimitClause(clause, globalTypeInfo);
        break;
    }
  }

  /**
   * Enhance FIND clause with type information
   */
  enhanceFindClause(clause, globalTypeInfo) {
    clause.typeInfo = {
      outputTypes: [],
      expectedSchema: null
    };

    for (const output of clause.outputs) {
      if (output.value === '*') {
        clause.typeInfo.outputTypes.push('concept_full');
        globalTypeInfo.expectedReturnType = 'concept_full';
      } else if (output.value === 'Concept') {
        clause.typeInfo.outputTypes.push('concept');
        globalTypeInfo.expectedReturnType = 'concept';
      } else if (this.typePatterns.CONCEPT_TYPE.test(output.value)) {
        clause.typeInfo.outputTypes.push('concept_typed');
        globalTypeInfo.fieldTypes.set('type', output.value);
      } else if (this.typePatterns.FIELD_PATH.test(output.value)) {
        clause.typeInfo.outputTypes.push('field_projection');
        const fieldType = this.inferFieldType(output.value);
        globalTypeInfo.fieldTypes.set(output.value, fieldType);
      }
    }
  }

  /**
   * Enhance WHERE clause with type validation
   */
  enhanceWhereClause(clause, globalTypeInfo) {
    clause.typeInfo = {
      patterns: [],
      typeCompatibility: []
    };

    for (const pattern of clause.patterns) {
      const patternTypeInfo = {
        field: pattern.field,
        fieldType: this.inferFieldType(pattern.field),
        operator: pattern.operator,
        value: pattern.value,
        valueType: this.inferValueType(pattern.value),
        compatible: false
      };

      // Check type compatibility
      patternTypeInfo.compatible = this.checkTypeCompatibility(
        patternTypeInfo.fieldType,
        patternTypeInfo.operator,
        patternTypeInfo.valueType
      );

      if (!patternTypeInfo.compatible) {
        globalTypeInfo.constraints.push({
          type: 'TYPE_MISMATCH',
          field: pattern.field,
          expected: patternTypeInfo.fieldType,
          actual: patternTypeInfo.valueType,
          operator: pattern.operator
        });
      }

      clause.typeInfo.patterns.push(patternTypeInfo);
      globalTypeInfo.fieldTypes.set(pattern.field, patternTypeInfo.fieldType);
    }
  }

  /**
   * Enhance FILTER clause with type validation
   */
  enhanceFilterClause(clause, globalTypeInfo) {
    clause.typeInfo = {
      expressions: [],
      typeCompatibility: []
    };

    for (const expr of clause.expressions) {
      const exprTypeInfo = {
        field: expr.field,
        fieldType: this.inferFieldType(expr.field),
        operator: expr.operator,
        value: expr.value,
        valueType: this.inferValueType(expr.value),
        compatible: false
      };

      exprTypeInfo.compatible = this.checkTypeCompatibility(
        exprTypeInfo.fieldType,
        exprTypeInfo.operator,
        exprTypeInfo.valueType
      );

      if (!exprTypeInfo.compatible) {
        globalTypeInfo.constraints.push({
          type: 'TYPE_MISMATCH',
          field: expr.field,
          expected: exprTypeInfo.fieldType,
          actual: exprTypeInfo.valueType,
          operator: expr.operator
        });
      }

      clause.typeInfo.expressions.push(exprTypeInfo);
    }
  }

  /**
   * Enhance AGGREGATE clause with type validation
   */
  enhanceAggregateClause(clause, globalTypeInfo) {
    clause.typeInfo = {
      functions: [],
      returnTypes: []
    };

    for (const func of clause.functions) {
      const funcTypeInfo = {
        function: func.function,
        argument: func.argument,
        argumentType: func.argument === '*' ? 'any' : this.inferFieldType(func.argument),
        returnType: this.getAggregateReturnType(func.function, func.argument),
        valid: true
      };

      // Validate function-argument compatibility
      funcTypeInfo.valid = this.validateAggregateFunction(func.function, funcTypeInfo.argumentType);

      if (!funcTypeInfo.valid) {
        globalTypeInfo.constraints.push({
          type: 'INVALID_AGGREGATE',
          function: func.function,
          argument: func.argument,
          argumentType: funcTypeInfo.argumentType
        });
      }

      clause.typeInfo.functions.push(funcTypeInfo);
      clause.typeInfo.returnTypes.push(funcTypeInfo.returnType);
    }

    globalTypeInfo.expectedReturnType = 'aggregation_result';
  }

  /**
   * Enhance LIMIT clause
   */
  enhanceLimitClause(clause, globalTypeInfo) {
    clause.typeInfo = {
      limit: clause.limit,
      valid: clause.limit > 0 && clause.limit <= 1000
    };

    if (!clause.typeInfo.valid) {
      globalTypeInfo.constraints.push({
        type: 'INVALID_LIMIT',
        value: clause.limit,
        min: 1,
        max: 1000
      });
    }
  }

  /**
   * Infer field type from field path
   */
  inferFieldType(field) {
    if (field === '*') return 'any';
    if (field === 'name') return 'string';
    if (field === 'type') return 'string';
    if (field === 'id') return 'uuid';
    if (field === 'created' || field === 'updated') return 'integer';
    if (field.includes('.')) return 'proposition_value';
    return 'string'; // Default assumption
  }

  /**
   * Infer value type from literal value
   */
  inferValueType(value) {
    if (typeof value === 'string') {
      if (this.typePatterns.UUID_LITERAL.test(value)) return 'uuid';
      if (this.typePatterns.NUMBER_LITERAL.test(value)) return 'number';
      if (this.typePatterns.BOOLEAN_LITERAL.test(value)) return 'boolean';
      return 'string';
    }
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'unknown';
  }

  /**
   * Check type compatibility between field and value
   */
  checkTypeCompatibility(fieldType, operator, valueType) {
    const compatibilityMatrix = {
      'string': {
        '=': ['string'],
        '!=': ['string'],
        'CONTAINS': ['string'],
        'MATCHES': ['string']
      },
      'number': {
        '=': ['number', 'string'],
        '!=': ['number', 'string'],
        '<': ['number'],
        '>': ['number'],
        '<=': ['number'],
        '>=': ['number']
      },
      'integer': {
        '=': ['number', 'string'],
        '!=': ['number', 'string'],
        '<': ['number'],
        '>': ['number'],
        '<=': ['number'],
        '>=': ['number']
      },
      'boolean': {
        '=': ['boolean', 'string'],
        '!=': ['boolean', 'string']
      },
      'uuid': {
        '=': ['uuid', 'string'],
        '!=': ['uuid', 'string']
      },
      'proposition_value': {
        '=': ['string'],
        '!=': ['string'],
        'CONTAINS': ['string']
      }
    };

    const allowedTypes = compatibilityMatrix[fieldType]?.[operator];
    return allowedTypes ? allowedTypes.includes(valueType) : false;
  }

  /**
   * Get return type for aggregate functions
   */
  getAggregateReturnType(functionName, argument) {
    const typeMapping = {
      'COUNT': 'integer',
      'SUM': 'number',
      'AVG': 'number',
      'MIN': argument === '*' ? 'any' : this.inferFieldType(argument),
      'MAX': argument === '*' ? 'any' : this.inferFieldType(argument),
      'DISTINCT': 'integer'
    };

    return typeMapping[functionName] || 'any';
  }

  /**
   * Validate aggregate function compatibility
   */
  validateAggregateFunction(functionName, argumentType) {
    const validCombinations = {
      'COUNT': ['any', 'string', 'number', 'boolean', 'uuid'],
      'SUM': ['number', 'integer'],
      'AVG': ['number', 'integer'],
      'MIN': ['any', 'string', 'number', 'integer'],
      'MAX': ['any', 'string', 'number', 'integer'],
      'DISTINCT': ['any', 'string', 'number', 'boolean', 'uuid']
    };

    const allowed = validCombinations[functionName];
    return allowed ? allowed.includes(argumentType) : false;
  }

  /**
   * Validate type consistency across clauses
   */
  validateTypeConsistency(ast) {
    const errors = [];

    // Check for conflicting field type assignments
    const fieldTypes = ast.typeInfo.fieldTypes;
    for (const [field, type] of fieldTypes) {
      // Additional validation logic can be added here
    }

    // Check aggregate vs non-aggregate compatibility
    const hasAggregate = ast.clauses.some(c => c.type === 'AggregateClause');
    const hasProjection = ast.clauses.some(c =>
      c.type === 'FindClause' &&
      c.outputs.some(o => o.value !== '*' && o.value !== 'Concept')
    );

    if (hasAggregate && hasProjection) {
      errors.push({
        type: 'INCOMPATIBLE_CLAUSES',
        message: 'Cannot combine aggregation with field projection'
      });
    }

    ast.typeInfo.consistencyErrors = errors;
  }

  /**
   * Validate AST semantics
   */
  validateASTSemantics(ast) {
    const errors = [];

    // Check for required clauses
    const hasFindClause = ast.clauses.some(c => c.type === 'FindClause');
    if (!hasFindClause) {
      errors.push({
        type: 'MISSING_FIND_CLAUSE',
        message: 'Query must contain a FIND clause'
      });
    }

    // Collect type constraint violations
    errors.push(...ast.typeInfo.constraints);

    // Collect consistency errors
    if (ast.typeInfo.consistencyErrors) {
      errors.push(...ast.typeInfo.consistencyErrors);
    }

    return {
      success: errors.length === 0,
      errors
    };
  }

  /**
   * Calculate type compliance score
   */
  calculateTypeCompliance(ast) {
    let totalChecks = 0;
    let passedChecks = 0;

    // Count clause-level type checks
    for (const clause of ast.clauses) {
      if (clause.typeInfo) {
        switch (clause.type) {
          case 'WhereClause':
            totalChecks += clause.typeInfo.patterns.length;
            passedChecks += clause.typeInfo.patterns.filter(p => p.compatible).length;
            break;
          case 'FilterClause':
            totalChecks += clause.typeInfo.expressions.length;
            passedChecks += clause.typeInfo.expressions.filter(e => e.compatible).length;
            break;
          case 'AggregateClause':
            totalChecks += clause.typeInfo.functions.length;
            passedChecks += clause.typeInfo.functions.filter(f => f.valid).length;
            break;
          case 'LimitClause':
            totalChecks += 1;
            passedChecks += clause.typeInfo.valid ? 1 : 0;
            break;
        }
      }
    }

    // Count global constraint violations
    const constraintViolations = ast.typeInfo.constraints.length;
    const consistencyErrors = ast.typeInfo.consistencyErrors?.length || 0;

    const complianceScore = totalChecks > 0 ?
      Math.max(0, (passedChecks - constraintViolations - consistencyErrors) / totalChecks) : 1.0;

    return {
      score: complianceScore,
      totalChecks,
      passedChecks,
      constraintViolations,
      consistencyErrors,
      grade: this.getComplianceGrade(complianceScore)
    };
  }

  /**
   * Get compliance grade from score
   */
  getComplianceGrade(score) {
    if (score >= 0.9) return 'A';
    if (score >= 0.8) return 'B';
    if (score >= 0.7) return 'C';
    if (score >= 0.6) return 'D';
    return 'F';
  }

  // Delegate other methods to original parser implementation
  parseClause(tokens, startIndex) {
    const keyword = tokens[startIndex].value.toUpperCase();
    switch (keyword) {
      case 'FIND': return this.parseFindClause(tokens, startIndex);
      case 'WHERE': return this.parseWhereClause(tokens, startIndex);
      case 'FILTER': return this.parseFilterClause(tokens, startIndex);
      case 'AGGREGATE': return this.parseAggregateClause(tokens, startIndex);
      case 'LIMIT': return this.parseLimitClause(tokens, startIndex);
      case 'CURSOR': return this.parseCursorClause(tokens, startIndex);
      default: throw new Error(`Unknown clause: ${keyword}`);
    }
  }

  // Import methods from original KQLParser class
  parseFindClause(tokens, startIndex) {
    let i = startIndex + 1;
    const outputs = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'IDENTIFIER') {
        const field = this.parseFieldPath(tokens, i);
        outputs.push({
          type: 'Output',
          value: field.path
        });
        i = field.nextIndex;

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

  parseWhereClause(tokens, startIndex) {
    let i = startIndex + 1;
    const patterns = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'IDENTIFIER') {
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

  parseFilterClause(tokens, startIndex) {
    let i = startIndex + 1;
    const expressions = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'IDENTIFIER') {
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

  parseAggregateClause(tokens, startIndex) {
    let i = startIndex + 1;
    const aggregateFunctions = [];

    while (i < tokens.length && tokens[i].type !== 'KEYWORD') {
      if (tokens[i].type === 'FUNCTION' || tokens[i].type === 'IDENTIFIER') {
        const functionName = tokens[i].value.toUpperCase();
        i++;

        if (i < tokens.length && tokens[i].type === 'LPAREN') {
          i++;

          let argument = null;
          if (i < tokens.length) {
            if (tokens[i].type === 'ASTERISK' || tokens[i].value === '*') {
              argument = '*';
              i++;
            } else if (tokens[i].type === 'IDENTIFIER') {
              const field = this.parseFieldPath(tokens, i);
              argument = field.path;
              i = field.nextIndex;
            }
          }

          if (i < tokens.length && tokens[i].type === 'RPAREN') {
            i++;

            aggregateFunctions.push({
              type: 'AggregateFunction',
              function: functionName,
              argument: argument,
              alias: `${functionName.toLowerCase()}_${argument === '*' ? 'all' : (argument ? argument.replace(/\./g, '_') : 'value')}`
            });
          }

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

  parseLimitClause(tokens, startIndex) {
    let i = startIndex + 1;
    let limit = 100;

    if (i < tokens.length && tokens[i].type === 'NUMBER') {
      limit = parseInt(tokens[i].value, 10);
      if (isNaN(limit) || limit < 1) {
        limit = 100;
      }
      limit = Math.min(limit, 1000);
      i++;
    }

    return {
      type: 'LimitClause',
      limit,
      nextIndex: i
    };
  }

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

  parseFieldPath(tokens, startIndex) {
    let i = startIndex;
    const pathParts = [];

    if (tokens[i] && tokens[i].type === 'IDENTIFIER') {
      pathParts.push(tokens[i].value);
      i++;

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
}

export default EnhancedKQLParser;