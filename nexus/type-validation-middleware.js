/**
 * Type Validation Middleware for KIP Phase 6 Implementation
 * Enforces type system compliance across all API endpoints
 */

import { TypeSystemEngine, TypeValidationError } from './type-system.js';
import { EnhancedKQLParser } from './kql-parser-enhanced.js';

export class TypeValidationMiddleware {
  constructor() {
    this.typeSystem = new TypeSystemEngine();
    this.enhancedParser = new EnhancedKQLParser(this.typeSystem);
    this.validationStats = {
      totalRequests: 0,
      validRequests: 0,
      typeErrors: 0,
      complianceScores: []
    };
  }

  /**
   * Express middleware for type validation
   */
  middleware() {
    return (req, res, next) => {
      // Skip validation for certain endpoints
      if (this.shouldSkipValidation(req)) {
        return next();
      }

      try {
        this.validationStats.totalRequests++;

        // Validate request based on endpoint
        const validation = this.validateRequest(req);

        if (validation.success) {
          this.validationStats.validRequests++;
          this.validationStats.complianceScores.push(validation.complianceScore || 1.0);

          // Attach validation results to request
          req.typeValidation = validation;
          next();
        } else {
          this.validationStats.typeErrors++;
          this.handleValidationError(res, validation);
        }
      } catch (error) {
        this.validationStats.typeErrors++;
        this.handleValidationException(res, error);
      }
    };
  }

  /**
   * Determine if validation should be skipped
   */
  shouldSkipValidation(req) {
    const skipPaths = [
      '/.well-known/ai-plugin.json',
      '/health',
      '/metrics',
      '/metadata/transparency'
    ];

    return skipPaths.some(path => req.path.startsWith(path));
  }

  /**
   * Validate request based on endpoint and method
   */
  validateRequest(req) {
    const endpoint = req.path;
    const method = req.method;

    switch (endpoint) {
      case '/execute_kip':
      case '/kql':
      case '/execute_kql':
        return this.validateKQLRequest(req);

      case '/propositions':
        return this.validatePropositionRequest(req);

      case '/cognitive/suggest':
      case '/cognitive/clarify':
      case '/cognitive/feedback':
      case '/cognitive/predict':
        return this.validateCognitiveRequest(req);

      default:
        return { success: true, message: 'No validation required' };
    }
  }

  /**
   * Validate KQL query requests
   */
  validateKQLRequest(req) {
    const { query, mode, timeout } = req.body;

    if (!query) {
      return {
        success: false,
        error: 'Query is required',
        code: 'MISSING_QUERY'
      };
    }

    try {
      // Validate basic query structure
      const queryValidation = this.typeSystem.validate('KQLQuery', { query, mode, timeout });

      if (!queryValidation.success) {
        return {
          success: false,
          error: 'Query validation failed',
          details: queryValidation.errors,
          code: 'QUERY_VALIDATION_ERROR'
        };
      }

      // Enhanced KQL parsing with type checking
      const enhancedAST = this.enhancedParser.parseWithTypeValidation(query);

      return {
        success: true,
        data: {
          query,
          ast: enhancedAST,
          typeValidation: enhancedAST.typeValidation
        },
        complianceScore: enhancedAST.typeValidation.typeCompliance.score,
        message: 'Query validated successfully'
      };

    } catch (error) {
      if (error instanceof TypeValidationError) {
        return {
          success: false,
          error: error.message,
          details: error.details,
          code: 'TYPE_VALIDATION_ERROR'
        };
      }

      return {
        success: false,
        error: 'Query parsing failed',
        details: { message: error.message },
        code: 'PARSE_ERROR'
      };
    }
  }

  /**
   * Validate proposition requests
   */
  validatePropositionRequest(req) {
    const { action, subject, predicate, object, metadata } = req.body;

    if (!action) {
      return {
        success: false,
        error: 'Action is required',
        code: 'MISSING_ACTION'
      };
    }

    switch (action) {
      case 'create':
        const propositionValidation = this.typeSystem.validateProposition({
          subject, predicate, object, metadata
        });

        if (!propositionValidation.success) {
          return {
            success: false,
            error: 'Proposition validation failed',
            details: propositionValidation.errors,
            code: 'PROPOSITION_VALIDATION_ERROR'
          };
        }

        return {
          success: true,
          data: propositionValidation.data,
          message: 'Proposition validated successfully'
        };

      case 'query':
      case 'find':
      case 'graph':
        // Basic validation for query operations
        if (!subject && !predicate) {
          return {
            success: false,
            error: 'Subject or predicate is required for query operations',
            code: 'MISSING_QUERY_PARAMS'
          };
        }

        return { success: true, message: 'Query operation validated' };

      default:
        return {
          success: false,
          error: `Unknown action: ${action}`,
          code: 'UNKNOWN_ACTION'
        };
    }
  }

  /**
   * Validate cognitive interface requests
   */
  validateCognitiveRequest(req) {
    const endpoint = req.path;

    switch (endpoint) {
      case '/cognitive/suggest':
        // Validate suggestion request
        return { success: true, message: 'Suggestion request validated' };

      case '/cognitive/clarify':
        const { query } = req.body;
        if (!query) {
          return {
            success: false,
            error: 'Query is required for clarification',
            code: 'MISSING_QUERY'
          };
        }
        return { success: true, message: 'Clarification request validated' };

      case '/cognitive/feedback':
        const { suggestionId, wasUseful } = req.body;
        if (!suggestionId) {
          return {
            success: false,
            error: 'SuggestionId is required',
            code: 'MISSING_SUGGESTION_ID'
          };
        }
        if (typeof wasUseful !== 'boolean') {
          return {
            success: false,
            error: 'wasUseful must be a boolean',
            code: 'INVALID_FEEDBACK_TYPE'
          };
        }
        return { success: true, message: 'Feedback request validated' };

      case '/cognitive/predict':
        const { history } = req.body;
        if (!Array.isArray(history)) {
          return {
            success: false,
            error: 'History must be an array',
            code: 'INVALID_HISTORY_TYPE'
          };
        }
        return { success: true, message: 'Prediction request validated' };

      default:
        return { success: true, message: 'No specific validation required' };
    }
  }

  /**
   * Handle validation errors
   */
  handleValidationError(res, validation) {
    const statusCode = this.getStatusCodeForError(validation.code);

    res.status(statusCode).json({
      ok: false,
      error: validation.error,
      details: validation.details,
      code: validation.code,
      typeValidation: {
        enabled: true,
        passed: false,
        errors: validation.details || []
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Handle validation exceptions
   */
  handleValidationException(res, error) {
    const statusCode = error instanceof TypeValidationError ? 400 : 500;

    res.status(statusCode).json({
      ok: false,
      error: error.message || 'Validation error',
      details: error.details || {},
      code: 'VALIDATION_EXCEPTION',
      typeValidation: {
        enabled: true,
        passed: false,
        errors: [error.message || 'Unknown validation error']
      },
      timestamp: new Date().toISOString()
    });
  }

  /**
   * Get appropriate HTTP status code for validation error
   */
  getStatusCodeForError(code) {
    const statusMapping = {
      'MISSING_QUERY': 400,
      'MISSING_ACTION': 400,
      'MISSING_QUERY_PARAMS': 400,
      'MISSING_SUGGESTION_ID': 400,
      'QUERY_VALIDATION_ERROR': 400,
      'TYPE_VALIDATION_ERROR': 400,
      'PROPOSITION_VALIDATION_ERROR': 400,
      'PARSE_ERROR': 400,
      'UNKNOWN_ACTION': 400,
      'INVALID_FEEDBACK_TYPE': 400,
      'INVALID_HISTORY_TYPE': 400,
      'VALIDATION_EXCEPTION': 500
    };

    return statusMapping[code] || 400;
  }

  /**
   * Response validation middleware
   */
  validateResponse() {
    return (req, res, next) => {
      const originalJson = res.json;

      res.json = (data) => {
        try {
          // Validate response structure if validation was performed on request
          if (req.typeValidation && req.typeValidation.success) {
            const responseValidation = this.typeSystem.validateResponse(data);

            // Add type validation metadata to response
            if (data && typeof data === 'object') {
              data.typeValidation = {
                enabled: true,
                passed: responseValidation.success,
                complianceScore: req.typeValidation.complianceScore,
                errors: responseValidation.success ? [] : responseValidation.errors
              };
            }
          }

          return originalJson.call(res, data);
        } catch (error) {
          console.error('Response validation error:', error);
          return originalJson.call(res, data);
        }
      };

      next();
    };
  }

  /**
   * Get validation statistics
   */
  getStats() {
    const avgComplianceScore = this.validationStats.complianceScores.length > 0 ?
      this.validationStats.complianceScores.reduce((a, b) => a + b, 0) / this.validationStats.complianceScores.length :
      0;

    return {
      totalRequests: this.validationStats.totalRequests,
      validRequests: this.validationStats.validRequests,
      typeErrors: this.validationStats.typeErrors,
      successRate: this.validationStats.totalRequests > 0 ?
        this.validationStats.validRequests / this.validationStats.totalRequests : 0,
      averageComplianceScore: avgComplianceScore,
      phase6ComplianceLevel: this.calculatePhase6Compliance()
    };
  }

  /**
   * Calculate Phase 6 compliance level
   */
  calculatePhase6Compliance() {
    const stats = this.validationStats;

    if (stats.totalRequests === 0) return 0;

    const successRate = stats.validRequests / stats.totalRequests;
    const avgCompliance = stats.complianceScores.length > 0 ?
      stats.complianceScores.reduce((a, b) => a + b, 0) / stats.complianceScores.length : 0;

    // Phase 6 target: 90% compliance
    const phase6Score = (successRate * 0.6 + avgCompliance * 0.4);

    return {
      score: phase6Score,
      target: 0.9,
      achieved: phase6Score >= 0.9,
      level: phase6Score >= 0.9 ? 'Phase 6 Compliant' :
             phase6Score >= 0.8 ? 'Phase 5 Compliant' :
             'Below Phase 5'
    };
  }

  /**
   * Reset validation statistics
   */
  resetStats() {
    this.validationStats = {
      totalRequests: 0,
      validRequests: 0,
      typeErrors: 0,
      complianceScores: []
    };
  }
}

export default TypeValidationMiddleware;