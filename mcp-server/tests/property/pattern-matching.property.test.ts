import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { GCPPatternStorage } from '../../src/storage/gcp-pattern-storage';
import { GCPPredictor } from '../../src/predictors/gcp-predictor';
import path from 'path';
import fs from 'fs';

/**
 * Property-Based Tests for Pattern Matching
 * 
 * These tests verify that our pattern matching logic holds certain properties
 * regardless of input data. This helps find edge cases that example-based
 * tests might miss.
 */

describe('Pattern Matching Property Tests', () => {
  let storage: GCPPatternStorage;
  let testDbPath: string;
  
  beforeEach(() => {
    testDbPath = path.join(process.cwd(), 'tests/fixtures', `property-test-${Date.now()}.db`);
    storage = new GCPPatternStorage(testDbPath);
  });
  
  afterEach(() => {
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });
  
  describe('Pattern Storage Properties', () => {
    it('should always return stored patterns in reverse chronological order', async () => {
      await fc.assert(
        fc.asyncProperty(
          // Generate array of patterns with timestamps
          fc.array(
            fc.record({
              tool: fc.constantFrom('bq-query', 'bq-list-datasets', 'gcp-sql'),
              params: fc.json(),
              outcome: fc.constantFrom('success', 'failure'),
              duration: fc.integer({ min: 0, max: 10000 }),
              timestamp: fc.integer({ min: 0, max: Date.now() }),
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (patterns) => {
            // Store patterns with specific timestamps
            for (const pattern of patterns) {
              await storage.recordCommandPattern({
                tool: pattern.tool,
                params: pattern.params,
                outcome: pattern.outcome as 'success' | 'failure',
                duration: pattern.duration,
                context: JSON.stringify({ timestamp: pattern.timestamp }),
              });
              
              // Small delay to ensure different timestamps
              await new Promise(resolve => setTimeout(resolve, 1));
            }
            
            // Retrieve patterns
            const retrieved = await storage.getSimilarCommands(
              patterns[0].tool,
              {},
              patterns.length
            );
            
            // Property: Patterns should be in reverse chronological order
            for (let i = 1; i < retrieved.length; i++) {
              expect(retrieved[i-1].timestamp.getTime())
                .toBeGreaterThanOrEqual(retrieved[i].timestamp.getTime());
            }
          }
        )
      );
    });
    
    it('should never lose patterns when storing concurrently', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              tool: fc.string({ minLength: 1, maxLength: 50 }),
              params: fc.json(),
              outcome: fc.constantFrom('success', 'failure'),
            }),
            { minLength: 5, maxLength: 20 }
          ),
          async (patterns) => {
            // Store patterns concurrently
            const storePromises = patterns.map(pattern =>
              storage.recordCommandPattern({
                tool: pattern.tool,
                params: pattern.params,
                outcome: pattern.outcome as 'success' | 'failure',
                duration: 1000,
              })
            );
            
            const ids = await Promise.all(storePromises);
            
            // Property: All IDs should be unique
            const uniqueIds = new Set(ids);
            expect(uniqueIds.size).toBe(ids.length);
            
            // Property: All patterns should be retrievable
            const allPatterns = await storage.getSimilarCommands(
              patterns[0].tool,
              {},
              1000
            );
            
            // At least our patterns should be there (might have more from other tests)
            expect(allPatterns.length).toBeGreaterThanOrEqual(
              patterns.filter(p => p.tool === patterns[0].tool).length
            );
          }
        )
      );
    });
    
    it('should maintain consistent success rate calculations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            queryType: fc.string({ minLength: 1, maxLength: 20 }),
            successCount: fc.integer({ min: 0, max: 100 }),
            failureCount: fc.integer({ min: 0, max: 100 }),
          }),
          async ({ queryType, successCount, failureCount }) => {
            // Skip if no patterns
            if (successCount + failureCount === 0) return;
            
            // Store success patterns
            for (let i = 0; i < successCount; i++) {
              await storage.recordQueryPattern({
                query_type: queryType,
                execution_time_ms: 1000,
                rows_returned: 100,
                success: true,
              });
            }
            
            // Store failure patterns
            for (let i = 0; i < failureCount; i++) {
              await storage.recordQueryPattern({
                query_type: queryType,
                execution_time_ms: 1000,
                rows_returned: 0,
                success: false,
                error_type: 'TEST_ERROR',
              });
            }
            
            // Get success rate
            const successRate = await storage.getQuerySuccessRate(queryType);
            
            // Property: Success rate should match our calculation
            const expectedRate = successCount / (successCount + failureCount);
            expect(successRate).toBeCloseTo(expectedRate, 2);
          }
        )
      );
    });
  });
  
  describe('Pattern Matching Properties', () => {
    it('should always find exact matches when they exist', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tool: fc.constantFrom('bq-query', 'bq-list-datasets'),
            query: fc.string({ minLength: 1, maxLength: 100 }),
            additionalPatterns: fc.array(
              fc.string({ minLength: 1, maxLength: 100 }),
              { maxLength: 10 }
            ),
          }),
          async ({ tool, query, additionalPatterns }) => {
            // Store the exact pattern
            const targetParams = { query };
            await storage.recordCommandPattern({
              tool,
              params: JSON.stringify(targetParams),
              outcome: 'success',
              duration: 1000,
            });
            
            // Store additional different patterns
            for (const otherQuery of additionalPatterns) {
              await storage.recordCommandPattern({
                tool,
                params: JSON.stringify({ query: otherQuery }),
                outcome: 'success',
                duration: 1000,
              });
            }
            
            // Search for exact match
            const matches = await storage.getSimilarCommands(tool, targetParams, 100);
            
            // Property: Exact match should be found
            const exactMatch = matches.find(m => {
              const params = JSON.parse(m.params);
              return params.query === query;
            });
            
            expect(exactMatch).toBeDefined();
          }
        )
      );
    });
    
    it('should respect limit parameter in all cases', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            patternCount: fc.integer({ min: 1, max: 50 }),
            requestedLimit: fc.integer({ min: 1, max: 20 }),
          }),
          async ({ patternCount, requestedLimit }) => {
            const tool = 'bq-query';
            
            // Store patterns
            for (let i = 0; i < patternCount; i++) {
              await storage.recordCommandPattern({
                tool,
                params: JSON.stringify({ id: i }),
                outcome: 'success',
                duration: 1000,
              });
            }
            
            // Retrieve with limit
            const patterns = await storage.getSimilarCommands(tool, {}, requestedLimit);
            
            // Property: Should never return more than requested
            expect(patterns.length).toBeLessThanOrEqual(requestedLimit);
            
            // Property: Should return min(available, requested)
            expect(patterns.length).toBe(Math.min(patternCount, requestedLimit));
          }
        )
      );
    });
  });
  
  describe('Cost Prediction Properties', () => {
    it('should never predict negative costs', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.record({
              queryType: fc.constantFrom('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
              tableSize: fc.float({ min: 0, max: 1000 }),
              cost: fc.float({ min: -10, max: 100 }), // Include negative to test
            }),
            { minLength: 1, maxLength: 20 }
          ),
          async (patterns) => {
            // Store patterns (even with negative costs)
            for (const pattern of patterns) {
              await storage.recordQueryPattern({
                query_type: pattern.queryType,
                table_size_gb: pattern.tableSize,
                execution_time_ms: 1000,
                cost_usd: pattern.cost,
                rows_returned: 1000,
                success: true,
              });
            }
            
            // Predict cost for each query type
            for (const queryType of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
              const prediction = await storage.predictQueryCost(queryType, 10);
              
              // Property: Predicted cost should never be negative
              expect(prediction.avgCost).toBeGreaterThanOrEqual(0);
            }
          }
        )
      );
    });
    
    it('should increase confidence with more data points', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            queryType: fc.string({ minLength: 1, maxLength: 20 }),
            dataPoints: fc.array(
              fc.float({ min: 0.01, max: 10 }),
              { minLength: 1, maxLength: 30 }
            ),
          }),
          async ({ queryType, dataPoints }) => {
            const confidences: number[] = [];
            
            // Add data points one by one and track confidence
            for (let i = 0; i < dataPoints.length; i++) {
              await storage.recordQueryPattern({
                query_type: queryType,
                table_size_gb: 1.0,
                execution_time_ms: 1000,
                cost_usd: dataPoints[i],
                rows_returned: 1000,
                success: true,
              });
              
              const prediction = await storage.predictQueryCost(queryType, 1.0);
              confidences.push(prediction.confidence);
            }
            
            // Property: Confidence should generally increase or stay same
            // (allowing for some variation due to data variance)
            let increasingTrend = 0;
            for (let i = 1; i < confidences.length; i++) {
              if (confidences[i] >= confidences[i-1]) {
                increasingTrend++;
              }
            }
            
            // At least 60% should show increasing/stable trend
            expect(increasingTrend / (confidences.length - 1))
              .toBeGreaterThan(0.6);
          }
        )
      );
    });
  });
  
  describe('Authentication Pattern Properties', () => {
    it('should show monotonic failure rate increase with token age', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.integer({ min: 0, max: 120 }), // Token ages in minutes
            { minLength: 20, maxLength: 50 }
          ),
          async (tokenAges) => {
            // Create realistic auth patterns (older tokens more likely to fail)
            for (const age of tokenAges) {
              const failureProbability = Math.min(age / 60, 1); // Linear increase up to 60 min
              const success = Math.random() > failureProbability;
              
              await storage.recordAuthPattern({
                token_age_minutes: age,
                operation_type: 'bq-query',
                success,
                error_message: success ? undefined : 'Token expired',
              });
            }
            
            // Check failure rates at different age thresholds
            const thresholds = [15, 30, 45, 60, 75, 90];
            const failureRates: number[] = [];
            
            for (const threshold of thresholds) {
              const rate = await storage.getAuthFailureRate(threshold);
              failureRates.push(rate);
            }
            
            // Property: Failure rate should generally increase with age threshold
            let monotonicIncreases = 0;
            for (let i = 1; i < failureRates.length; i++) {
              if (failureRates[i] >= failureRates[i-1]) {
                monotonicIncreases++;
              }
            }
            
            // Allow some deviation but expect general trend
            expect(monotonicIncreases).toBeGreaterThan(failureRates.length * 0.6);
          }
        )
      );
    });
  });
  
  describe('Query Duration Properties', () => {
    it('should calculate average duration correctly regardless of data distribution', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            queryType: fc.string({ minLength: 1, maxLength: 20 }),
            durations: fc.array(
              fc.integer({ min: 100, max: 10000 }),
              { minLength: 1, maxLength: 50 }
            ),
          }),
          async ({ queryType, durations }) => {
            // Store patterns with various durations
            for (const duration of durations) {
              await storage.recordQueryPattern({
                query_type: queryType,
                execution_time_ms: duration,
                cost_usd: 0.01,
                rows_returned: 100,
                success: true,
              });
            }
            
            // Get average from storage
            const avgDuration = await storage.getAverageQueryDuration(queryType);
            
            // Calculate expected average
            const expectedAvg = durations.reduce((a, b) => a + b, 0) / durations.length;
            
            // Property: Calculated average should match
            expect(avgDuration).toBeCloseTo(expectedAvg, 0);
          }
        )
      );
    });
  });
});

/**
 * Property-based test generators for pattern matching scenarios
 */
export const patternGenerators = {
  // Generate valid BigQuery queries
  validBigQueryQuery: () => fc.oneof(
    fc.constant('SELECT 1'),
    fc.constant('SELECT * FROM dataset.table LIMIT 10'),
    fc.tuple(
      fc.constantFrom('SELECT', 'INSERT', 'UPDATE', 'DELETE'),
      fc.constantFrom('*', 'id, name', 'COUNT(*)'),
      fc.constantFrom('dataset.table', 'project.dataset.table'),
    ).map(([action, fields, table]) => `${action} ${fields} FROM ${table}`),
  ),
  
  // Generate query parameters
  queryParams: () => fc.record({
    query: patternGenerators.validBigQueryQuery(),
    projectId: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
    location: fc.option(fc.constantFrom('US', 'EU', 'asia-northeast1')),
    useLegacySql: fc.option(fc.boolean()),
  }),
  
  // Generate realistic patterns
  commandPattern: () => fc.record({
    tool: fc.constantFrom('bq-query', 'bq-list-datasets', 'bq-list-tables', 'gcp-sql'),
    params: patternGenerators.queryParams(),
    outcome: fc.constantFrom('success', 'failure'),
    duration: fc.integer({ min: 50, max: 5000 }),
    cost: fc.option(fc.float({ min: 0, max: 10 })),
  }),
};