import { TestPattern } from '../types/test-types.js';
import { GCPCommandPattern, GCPQueryPattern } from '../../src/storage/gcp-pattern-storage.js';

/**
 * Factory for creating mock test data
 */
export class MockFactory {
  /**
   * Create a mock GCP command pattern
   */
  static createCommandPattern(overrides?: Partial<GCPCommandPattern>): GCPCommandPattern {
    return {
      id: Math.floor(Math.random() * 10000),
      tool: 'bq-query',
      params: JSON.stringify({ query: 'SELECT * FROM dataset.table' }),
      context: JSON.stringify({ timestamp: Date.now() }),
      outcome: 'success',
      duration: 1500,
      timestamp: new Date(),
      ...overrides,
    };
  }

  /**
   * Create a mock GCP query pattern
   */
  static createQueryPattern(overrides?: Partial<GCPQueryPattern>): GCPQueryPattern {
    return {
      id: Math.floor(Math.random() * 10000),
      query_type: 'SELECT',
      table_size_gb: 1.5,
      execution_time_ms: 2500,
      cost_usd: 0.05,
      rows_returned: 1000,
      success: true,
      timestamp: new Date(),
      ...overrides,
    };
  }

  /**
   * Create BigQuery failure test patterns
   */
  static createBigQueryFailurePatterns(): TestPattern[] {
    return [
      // Syntax errors
      {
        scenario: 'Missing FROM clause',
        tool: 'bq-query',
        params: { query: 'SELECT id, name WHERE id > 100' },
        expectedOutcome: 'failure',
        expectedError: 'Syntax error: Expected keyword FROM',
      },
      {
        scenario: 'Invalid column reference',
        tool: 'bq-query',
        params: { query: 'SELECT non_existent_column FROM dataset.table' },
        expectedOutcome: 'failure',
        expectedError: 'Column not found: non_existent_column',
      },
      {
        scenario: 'Incorrect JOIN syntax',
        tool: 'bq-query',
        params: { query: 'SELECT * FROM table1 JOIN ON table1.id = table2.id' },
        expectedOutcome: 'failure',
        expectedError: 'Syntax error: Expected table name after JOIN',
      },
      
      // Permission errors
      {
        scenario: 'Dataset access denied',
        tool: 'bq-list-tables',
        params: { datasetId: 'restricted_dataset' },
        expectedOutcome: 'failure',
        expectedError: 'Permission denied on dataset',
      },
      {
        scenario: 'Table not found',
        tool: 'gcp-sql',
        params: { 
          operation: 'describe-table',
          dataset: 'public',
          table: 'non_existent_table'
        },
        expectedOutcome: 'failure',
        expectedError: 'Table not found',
      },
      
      // Resource limit errors
      {
        scenario: 'Query timeout',
        tool: 'bq-query',
        params: { 
          query: 'SELECT * FROM massive_table CROSS JOIN another_massive_table',
          timeout: 1000
        },
        expectedOutcome: 'failure',
        expectedError: 'Query exceeded timeout',
        expectedDuration: 1000,
      },
      {
        scenario: 'Memory exceeded',
        tool: 'bq-query',
        params: { 
          query: 'SELECT ARRAY_AGG(data ORDER BY rand()) FROM huge_table'
        },
        expectedOutcome: 'failure',
        expectedError: 'Resources exceeded: Memory',
      },
      
      // Cost overrun scenarios
      {
        scenario: 'Large table scan without filter',
        tool: 'bq-query',
        params: { 
          query: 'SELECT * FROM project.dataset.billion_row_table'
        },
        expectedOutcome: 'failure',
        expectedError: 'Query would scan 1.2TB',
        expectedCost: 6.0,
        expectedWarnings: ['High cost query detected'],
      },
      {
        scenario: 'Cartesian join',
        tool: 'bq-query',
        params: { 
          query: 'SELECT * FROM table1, table2, table3'
        },
        expectedOutcome: 'failure',
        expectedError: 'Cartesian joins are not recommended',
        expectedWarnings: ['Potential cartesian product detected'],
      },
    ];
  }

  /**
   * Create successful BigQuery patterns
   */
  static createBigQuerySuccessPatterns(): TestPattern[] {
    return [
      {
        scenario: 'Simple SELECT with LIMIT',
        tool: 'bq-query',
        params: { query: 'SELECT id, name FROM dataset.users LIMIT 10' },
        expectedOutcome: 'success',
        expectedCost: 0.0,
        expectedDuration: 500,
      },
      {
        scenario: 'Aggregate query with GROUP BY',
        tool: 'bq-query',
        params: { 
          query: 'SELECT country, COUNT(*) as count FROM dataset.users GROUP BY country'
        },
        expectedOutcome: 'success',
        expectedCost: 0.01,
        expectedDuration: 1500,
      },
      {
        scenario: 'List datasets',
        tool: 'bq-list-datasets',
        params: { projectId: 'test-project' },
        expectedOutcome: 'success',
        expectedDuration: 200,
      },
      {
        scenario: 'Create dataset',
        tool: 'bq-create-dataset',
        params: { 
          datasetId: 'new_dataset',
          location: 'US'
        },
        expectedOutcome: 'success',
        expectedDuration: 1000,
      },
    ];
  }

  /**
   * Create authentication failure patterns
   */
  static createAuthFailurePatterns(): TestPattern[] {
    return [
      {
        scenario: 'Expired token',
        tool: 'bq-query',
        params: { query: 'SELECT 1' },
        expectedOutcome: 'failure',
        expectedError: 'Token has expired',
      },
      {
        scenario: 'Invalid credentials',
        tool: 'gcp-sql',
        params: { operation: 'list-datasets' },
        expectedOutcome: 'failure',
        expectedError: 'Invalid authentication credentials',
      },
      {
        scenario: 'Service account key rotated',
        tool: 'bq-list-tables',
        params: { datasetId: 'public' },
        expectedOutcome: 'failure',
        expectedError: 'The provided key has been revoked',
      },
    ];
  }

  /**
   * Create edge case patterns
   */
  static createEdgeCasePatterns(): TestPattern[] {
    return [
      {
        scenario: 'Cross-region query',
        tool: 'bq-query',
        params: { 
          query: 'SELECT * FROM us.dataset.table JOIN eu.dataset.table USING(id)',
          location: 'US'
        },
        expectedOutcome: 'failure',
        expectedError: 'Cross-region joins are not allowed',
        expectedWarnings: ['Dataset locations do not match'],
      },
      {
        scenario: 'Invalid location string',
        tool: 'bq-create-dataset',
        params: { 
          datasetId: 'test_dataset',
          location: 'mars-central1'
        },
        expectedOutcome: 'failure',
        expectedError: 'Invalid location',
      },
      {
        scenario: 'Quota exhaustion',
        tool: 'bq-query',
        params: { query: 'SELECT * FROM dataset.table' },
        expectedOutcome: 'failure',
        expectedError: 'Quota exceeded: Queries per day',
      },
    ];
  }

  /**
   * Generate random patterns for load testing
   */
  static generateRandomPatterns(count: number): TestPattern[] {
    const patterns: TestPattern[] = [];
    const tools = ['bq-query', 'bq-list-datasets', 'bq-list-tables', 'gcp-sql'];
    const outcomes: Array<'success' | 'failure'> = ['success', 'failure'];
    
    for (let i = 0; i < count; i++) {
      const tool = tools[Math.floor(Math.random() * tools.length)];
      const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
      
      patterns.push({
        scenario: `Random test ${i}`,
        tool,
        params: this.generateRandomParams(tool),
        expectedOutcome: outcome,
        expectedError: outcome === 'failure' ? 'Random error' : undefined,
        expectedCost: Math.random() * 5,
        expectedDuration: Math.floor(Math.random() * 5000),
      });
    }
    
    return patterns;
  }

  private static generateRandomParams(tool: string): any {
    switch (tool) {
      case 'bq-query':
        return { query: `SELECT * FROM dataset.table${Math.floor(Math.random() * 10)}` };
      case 'bq-list-datasets':
        return { projectId: `project-${Math.floor(Math.random() * 100)}` };
      case 'bq-list-tables':
        return { datasetId: `dataset_${Math.floor(Math.random() * 10)}` };
      case 'gcp-sql':
        return { 
          operation: 'list-tables',
          dataset: `dataset_${Math.floor(Math.random() * 10)}`
        };
      default:
        return {};
    }
  }

  /**
   * Create a mock prediction response
   */
  static createMockPrediction(pattern: TestPattern, accuracy: number = 0.8): any {
    const willSucceed = pattern.expectedOutcome === 'success';
    const isCorrect = Math.random() < accuracy;
    
    // Generate prediction based on accuracy
    const successProbability = isCorrect 
      ? (willSucceed ? 0.7 + Math.random() * 0.3 : 0.1 + Math.random() * 0.3)
      : (willSucceed ? 0.1 + Math.random() * 0.3 : 0.7 + Math.random() * 0.3);
    
    return {
      successProbability,
      confidence: 0.5 + Math.random() * 0.5,
      estimatedCost: pattern.expectedCost ? pattern.expectedCost * (0.8 + Math.random() * 0.4) : undefined,
      estimatedDuration: pattern.expectedDuration ? pattern.expectedDuration * (0.8 + Math.random() * 0.4) : 1000,
      warnings: pattern.expectedWarnings || [],
      suggestions: [],
      explanation: 'Based on historical patterns',
    };
  }
}