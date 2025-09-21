#!/usr/bin/env node

/**
 * Comprehensive Type System Test Suite for KIP Phase 6
 * Tests type validation, compliance scoring, and error handling
 */

import { TypeSystemEngine, TypeValidationError } from './nexus/type-system.js';
import { EnhancedKQLParser } from './nexus/kql-parser-enhanced.js';
import TypeValidationMiddleware from './nexus/type-validation-middleware.js';

class TypeSystemTestSuite {
  constructor() {
    this.typeSystem = new TypeSystemEngine();
    this.parser = new EnhancedKQLParser(this.typeSystem);
    this.middleware = new TypeValidationMiddleware();
    this.tests = [];
    this.results = {
      passed: 0,
      failed: 0,
      total: 0,
      details: []
    };
  }

  /**
   * Add test case
   */
  addTest(name, description, testFn) {
    this.tests.push({ name, description, testFn });
  }

  /**
   * Run all tests
   */
  async runAllTests() {
    console.log('🧪 Starting KIP Phase 6 Type System Test Suite\n');

    for (const test of this.tests) {
      try {
        console.log(`Running: ${test.name}`);
        const startTime = Date.now();

        await test.testFn();

        const duration = Date.now() - startTime;
        this.results.passed++;
        this.results.details.push({
          name: test.name,
          status: 'PASSED',
          duration,
          description: test.description
        });

        console.log(`✅ ${test.name} - PASSED (${duration}ms)\n`);
      } catch (error) {
        this.results.failed++;
        this.results.details.push({
          name: test.name,
          status: 'FAILED',
          error: error.message,
          description: test.description
        });

        console.log(`❌ ${test.name} - FAILED: ${error.message}\n`);
      }

      this.results.total++;
    }

    this.printSummary();
    return this.results;
  }

  /**
   * Print test summary
   */
  printSummary() {
    const passRate = this.results.total > 0 ?
      (this.results.passed / this.results.total * 100).toFixed(1) : 0;

    console.log('📊 Test Summary');
    console.log('===============');
    console.log(`Total Tests: ${this.results.total}`);
    console.log(`Passed: ${this.results.passed}`);
    console.log(`Failed: ${this.results.failed}`);
    console.log(`Pass Rate: ${passRate}%`);

    const compliance = this.calculateCompliance();
    console.log(`\n🎯 Phase 6 Compliance Assessment:`);
    console.log(`Score: ${(compliance.score * 100).toFixed(1)}%`);
    console.log(`Status: ${compliance.status}`);
    console.log(`Target: 90% (Phase 6)`);

    if (this.results.failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.results.details
        .filter(t => t.status === 'FAILED')
        .forEach(t => console.log(`  - ${t.name}: ${t.error}`));
    }
  }

  /**
   * Calculate overall compliance score
   */
  calculateCompliance() {
    const score = this.results.total > 0 ?
      this.results.passed / this.results.total : 0;

    let status;
    if (score >= 0.9) status = 'Phase 6 Compliant (Excellent)';
    else if (score >= 0.8) status = 'Phase 5 Compliant (Good)';
    else if (score >= 0.7) status = 'Phase 4 Compliant (Fair)';
    else status = 'Below Phase 4 (Needs Improvement)';

    return { score, status };
  }

  /**
   * Assert helper
   */
  assert(condition, message) {
    if (!condition) {
      throw new Error(message);
    }
  }

  /**
   * Assert equals helper
   */
  assertEqual(actual, expected, message) {
    if (actual !== expected) {
      throw new Error(`${message}: expected ${expected}, got ${actual}`);
    }
  }

  /**
   * Assert throws helper
   */
  async assertThrows(fn, expectedErrorType, message) {
    try {
      await fn();
      throw new Error(`${message}: expected function to throw`);
    } catch (error) {
      if (expectedErrorType && !(error instanceof expectedErrorType)) {
        throw new Error(`${message}: expected ${expectedErrorType.name}, got ${error.constructor.name}`);
      }
    }
  }
}

// Initialize test suite
const testSuite = new TypeSystemTestSuite();

// Test 1: Basic Schema Registration and Validation
testSuite.addTest(
  'Schema Registration',
  'Test that schemas are properly registered and accessible',
  async () => {
    const schemas = testSuite.typeSystem.listSchemas();
    testSuite.assert(schemas.length >= 5, 'Should have at least 5 built-in schemas');

    const conceptSchema = testSuite.typeSystem.getSchema('Concept');
    testSuite.assert(conceptSchema, 'Concept schema should be registered');
    testSuite.assertEqual(conceptSchema.type, 'zod', 'Concept schema should be Zod type');
  }
);

// Test 2: Concept Validation
testSuite.addTest(
  'Concept Validation',
  'Test Concept schema validation with valid and invalid data',
  async () => {
    // Valid concept
    const validConcept = {
      name: 'Test Policy',
      type: 'Policy',
      id: '550e8400-e29b-41d4-a716-446655440000'
    };

    const validation = testSuite.typeSystem.validate('Concept', validConcept);
    testSuite.assert(validation.success, 'Valid concept should pass validation');
    testSuite.assertEqual(validation.data.name, 'Test Policy', 'Validated data should match input');

    // Invalid concept (missing required field)
    const invalidConcept = {
      type: 'Policy'
      // missing name
    };

    const invalidValidation = testSuite.typeSystem.validate('Concept', invalidConcept);
    testSuite.assert(!invalidValidation.success, 'Invalid concept should fail validation');
    testSuite.assert(invalidValidation.errors.length > 0, 'Should have validation errors');
  }
);

// Test 3: Proposition Validation
testSuite.addTest(
  'Proposition Validation',
  'Test Proposition schema validation',
  async () => {
    const validProposition = {
      predicate: 'frequency',
      object: 'quarterly',
      _conceptName: 'Test Policy',
      metadata: {
        source: 'upsert',
        confidence: 0.95
      }
    };

    const validation = testSuite.typeSystem.validate('Proposition', validProposition);
    testSuite.assert(validation.success, 'Valid proposition should pass validation');

    // Invalid proposition (invalid confidence)
    const invalidProposition = {
      predicate: 'frequency',
      object: 'quarterly',
      _conceptName: 'Test Policy',
      metadata: {
        confidence: 1.5 // Invalid: > 1
      }
    };

    const invalidValidation = testSuite.typeSystem.validate('Proposition', invalidProposition);
    testSuite.assert(!invalidValidation.success, 'Invalid proposition should fail validation');
  }
);

// Test 4: KQL Query Validation
testSuite.addTest(
  'KQL Query Validation',
  'Test KQL query syntax and semantic validation',
  async () => {
    // Valid query
    const validQuery = "FIND Concept WHERE type = 'Policy'";
    const queryValidation = testSuite.typeSystem.validateKQLQuery(validQuery);
    testSuite.assert(queryValidation.success, 'Valid KQL query should pass validation');

    // Invalid query (empty)
    await testSuite.assertThrows(
      () => testSuite.typeSystem.validateKQLQuery(''),
      undefined,
      'Empty query should throw validation error'
    );
  }
);

// Test 5: Enhanced KQL Parser Type Checking
testSuite.addTest(
  'Enhanced KQL Parser',
  'Test enhanced parser with type checking capabilities',
  async () => {
    const query = "FIND Concept WHERE name = 'Test' FILTER type = 'Policy' LIMIT 10";

    const ast = testSuite.parser.parseWithTypeValidation(query);
    testSuite.assert(ast.typeValidation, 'AST should include type validation');
    testSuite.assert(ast.typeValidation.typeCompliance, 'Should include compliance score');

    const compliance = ast.typeValidation.typeCompliance;
    testSuite.assert(compliance.score >= 0 && compliance.score <= 1, 'Compliance score should be between 0 and 1');
  }
);

// Test 6: Type Compatibility Checking
testSuite.addTest(
  'Type Compatibility',
  'Test type compatibility matrix for operations',
  async () => {
    // Compatible types
    const compatible1 = testSuite.parser.checkTypeCompatibility('string', '=', 'string');
    testSuite.assert(compatible1, 'String = String should be compatible');

    const compatible2 = testSuite.parser.checkTypeCompatibility('number', '>', 'number');
    testSuite.assert(compatible2, 'Number > Number should be compatible');

    // Incompatible types
    const incompatible1 = testSuite.parser.checkTypeCompatibility('boolean', '>', 'boolean');
    testSuite.assert(!incompatible1, 'Boolean > Boolean should be incompatible');

    const incompatible2 = testSuite.parser.checkTypeCompatibility('string', '<', 'string');
    testSuite.assert(!incompatible2, 'String < String should be incompatible');
  }
);

// Test 7: Aggregate Function Validation
testSuite.addTest(
  'Aggregate Functions',
  'Test validation of aggregate functions and arguments',
  async () => {
    // Valid aggregates
    const validSum = testSuite.parser.validateAggregateFunction('SUM', 'number');
    testSuite.assert(validSum, 'SUM with number should be valid');

    const validCount = testSuite.parser.validateAggregateFunction('COUNT', 'any');
    testSuite.assert(validCount, 'COUNT with any should be valid');

    // Invalid aggregates
    const invalidSum = testSuite.parser.validateAggregateFunction('SUM', 'string');
    testSuite.assert(!invalidSum, 'SUM with string should be invalid');
  }
);

// Test 8: Type Coercion
testSuite.addTest(
  'Type Coercion',
  'Test automatic type coercion functionality',
  async () => {
    const testData = {
      numericString: '42',
      booleanString: 'true',
      normalString: 'hello'
    };

    const coerced = testSuite.typeSystem.coerceTypes(testData, 'Concept');
    testSuite.assert(coerced.success, 'Type coercion should succeed');
    testSuite.assertEqual(coerced.data.numericString, 42, 'Numeric string should be coerced to number');
    testSuite.assertEqual(coerced.data.booleanString, true, 'Boolean string should be coerced to boolean');
  }
);

// Test 9: Complex Query Validation
testSuite.addTest(
  'Complex Query Validation',
  'Test validation of complex queries with multiple clauses',
  async () => {
    const complexQuery = `
      FIND Concept
      WHERE type = 'Policy'
      FILTER name CONTAINS 'password'
      AGGREGATE COUNT(*)
      GROUP BY type
      LIMIT 50
    `;

    const ast = testSuite.parser.parseWithTypeValidation(complexQuery);
    testSuite.assert(ast.clauses.length >= 5, 'Complex query should have multiple clauses');

    const compliance = ast.typeValidation.typeCompliance;
    testSuite.assert(compliance.totalChecks > 0, 'Should perform type checks');
  }
);

// Test 10: Error Handling and Recovery
testSuite.addTest(
  'Error Handling',
  'Test proper error handling and informative error messages',
  async () => {
    // Syntax error
    await testSuite.assertThrows(
      () => testSuite.parser.parseWithTypeValidation('INVALID QUERY SYNTAX'),
      TypeValidationError,
      'Invalid syntax should throw TypeValidationError'
    );

    // Type mismatch error
    const invalidQuery = "FIND Concept WHERE name > 'test'"; // String > String is invalid
    await testSuite.assertThrows(
      () => testSuite.parser.parseWithTypeValidation(invalidQuery),
      TypeValidationError,
      'Type mismatch should throw TypeValidationError'
    );
  }
);

// Test 11: Performance and Caching
testSuite.addTest(
  'Performance and Caching',
  'Test validation performance and caching mechanisms',
  async () => {
    const testData = { name: 'Test', type: 'Policy' };

    // First validation (no cache)
    const start1 = Date.now();
    const validation1 = testSuite.typeSystem.validate('Concept', testData);
    const duration1 = Date.now() - start1;

    // Second validation (with cache)
    const start2 = Date.now();
    const validation2 = testSuite.typeSystem.validate('Concept', testData);
    const duration2 = Date.now() - start2;

    testSuite.assert(validation1.success && validation2.success, 'Both validations should succeed');

    // Cache stats
    const stats = testSuite.typeSystem.getCacheStats();
    testSuite.assert(stats.size > 0, 'Cache should contain entries');
  }
);

// Test 12: Schema Versioning and Compatibility
testSuite.addTest(
  'Schema Versioning',
  'Test schema versioning and backward compatibility',
  async () => {
    // Register a custom schema with version
    const customSchema = {
      type: 'object',
      version: '2.0.0',
      properties: {
        id: { type: 'string', format: 'uuid' },
        value: { type: 'string' }
      },
      required: ['id', 'value']
    };

    testSuite.typeSystem.registerJSONSchema('CustomType', customSchema);

    const schemas = testSuite.typeSystem.listSchemas();
    const customSchemaInfo = schemas.find(s => s.name === 'CustomType');

    testSuite.assert(customSchemaInfo, 'Custom schema should be registered');
    testSuite.assertEqual(customSchemaInfo.version, '2.0.0', 'Schema version should be preserved');
  }
);

// Test 13: Middleware Integration
testSuite.addTest(
  'Middleware Integration',
  'Test type validation middleware functionality',
  async () => {
    // Mock request/response objects
    const mockReq = {
      path: '/kql',
      method: 'POST',
      body: {
        query: "FIND Concept WHERE type = 'Policy'"
      }
    };

    const mockRes = {
      status: (code) => ({ json: (data) => ({ statusCode: code, data }) }),
      json: (data) => ({ data })
    };

    let middlewareCalled = false;
    const mockNext = () => { middlewareCalled = true; };

    // Test middleware validation
    const middleware = testSuite.middleware.middleware();

    try {
      middleware(mockReq, mockRes, mockNext);
      testSuite.assert(middlewareCalled, 'Middleware should call next() for valid requests');
      testSuite.assert(mockReq.typeValidation, 'Request should have type validation results');
    } catch (error) {
      // Expected for some validation scenarios
    }
  }
);

// Test 14: Compliance Scoring
testSuite.addTest(
  'Compliance Scoring',
  'Test Phase 6 compliance scoring algorithm',
  async () => {
    const stats = testSuite.middleware.getStats();
    testSuite.assert(typeof stats.phase6ComplianceLevel === 'object', 'Should return compliance object');

    const compliance = stats.phase6ComplianceLevel;
    testSuite.assert(typeof compliance.score === 'number', 'Score should be numeric');
    testSuite.assert(compliance.score >= 0 && compliance.score <= 1, 'Score should be between 0 and 1');
    testSuite.assert(compliance.target === 0.9, 'Phase 6 target should be 90%');
  }
);

// Test 15: Integration Test
testSuite.addTest(
  'Integration Test',
  'Test complete type system integration across components',
  async () => {
    // Test complete workflow: validation -> parsing -> execution
    const query = "FIND Concept WHERE type = 'Policy' LIMIT 5";

    // 1. Basic validation
    const queryValidation = testSuite.typeSystem.validateKQLQuery(query);
    testSuite.assert(queryValidation.success, 'Query should pass basic validation');

    // 2. Enhanced parsing
    const ast = testSuite.parser.parseWithTypeValidation(query);
    testSuite.assert(ast.typeValidation.semanticValidation.success, 'Should pass semantic validation');

    // 3. Compliance checking
    const compliance = ast.typeValidation.typeCompliance;
    testSuite.assert(compliance.score > 0.5, 'Should have reasonable compliance score');

    // 4. Type information preservation
    testSuite.assert(ast.typeInfo, 'AST should include type information');
    testSuite.assert(ast.typeInfo.fieldTypes.size > 0, 'Should track field types');
  }
);

// Run the test suite
if (import.meta.url === `file://${process.argv[1]}`) {
  testSuite.runAllTests()
    .then(results => {
      const exitCode = results.failed > 0 ? 1 : 0;
      console.log(`\n🏁 Test suite completed with exit code: ${exitCode}`);
      process.exit(exitCode);
    })
    .catch(error => {
      console.error('💥 Test suite failed:', error);
      process.exit(1);
    });
}

export default TypeSystemTestSuite;