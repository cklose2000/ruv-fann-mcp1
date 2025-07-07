import { describe, it, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { GCPPredictor } from '../../src/predictors/gcp-predictor';
import type { RuvFannClient } from '../../src/clients/ruv-fann-client';
import type { GCPPatternStorage } from '../../src/storage/gcp-pattern-storage';

/**
 * Property-Based Tests for GCP Predictor
 * 
 * These tests verify that prediction logic maintains certain invariants
 * regardless of input patterns and historical data.
 */

describe('GCP Predictor Property Tests', () => {
  let predictor: GCPPredictor;
  let mockRuvFannClient: RuvFannClient;
  let mockPatternStorage: GCPPatternStorage;
  
  beforeEach(() => {
    // Create minimal mocks that maintain properties
    mockRuvFannClient = {
      predictPattern: async () => ({
        successProbability: Math.random(),
        confidence: Math.random(),
      }),
      spawnPatternAnalysisAgents: async () => [],
    } as any;
    
    mockPatternStorage = {
      getSimilarCommands: async () => [],
      getSuccessfulPatterns: async () => [],
      recordCommandPattern: async () => 1,
      predictQueryCost: async () => ({ avgCost: 1.0, confidence: 0.5 }),
      getAuthFailureRate: async () => 0.1,
      getAverageQueryDuration: async () => 1000,
      getQuerySuccessRate: async () => 0.8,
    } as any;
    
    predictor = new GCPPredictor(mockRuvFannClient, mockPatternStorage);
  });
  
  describe('Prediction Output Properties', () => {
    it('should always return valid probability ranges', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tool: fc.constantFrom('bq-query', 'bq-list-datasets', 'gcp-sql'),
            params: fc.object(),
            context: fc.object(),
          }),
          async ({ tool, params, context }) => {
            const prediction = await predictor.predictGCPOperation(tool, params, context);
            
            // Property: Success probability must be in [0, 1]
            expect(prediction.successProbability).toBeGreaterThanOrEqual(0);
            expect(prediction.successProbability).toBeLessThanOrEqual(1);
            
            // Property: Confidence must be in [0, 1]
            expect(prediction.confidence).toBeGreaterThanOrEqual(0);
            expect(prediction.confidence).toBeLessThanOrEqual(1);
            
            // Property: Arrays must be defined
            expect(Array.isArray(prediction.warnings)).toBe(true);
            expect(Array.isArray(prediction.suggestions)).toBe(true);
            
            // Property: Explanation must be non-empty
            expect(prediction.explanation).toBeTruthy();
            expect(typeof prediction.explanation).toBe('string');
          }
        )
      );
    });
    
    it('should maintain consistency between probability and warnings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tool: fc.constant('bq-query'),
            query: fc.string(),
            historicalFailureRate: fc.float({ min: 0, max: 1 }),
          }),
          async ({ tool, query, historicalFailureRate }) => {
            // Mock storage to return specific failure rate
            mockPatternStorage.getSimilarCommands = async () => {
              const totalPatterns = 100;
              const failures = Math.floor(totalPatterns * historicalFailureRate);
              const successes = totalPatterns - failures;
              
              return [
                ...Array(successes).fill(null).map(() => ({
                  outcome: 'success',
                  tool,
                  params: JSON.stringify({ query }),
                })),
                ...Array(failures).fill(null).map(() => ({
                  outcome: 'failure',
                  tool,
                  params: JSON.stringify({ query }),
                  error: 'Test error',
                })),
              ] as any;
            };
            
            const prediction = await predictor.predictGCPOperation(
              tool,
              { query },
              {}
            );
            
            // Property: High failure rate should correlate with warnings
            if (historicalFailureRate > 0.7) {
              expect(prediction.warnings.length).toBeGreaterThan(0);
            }
            
            // Property: Low success probability should have warnings
            if (prediction.successProbability < 0.3) {
              expect(prediction.warnings.length).toBeGreaterThan(0);
            }
            
            // Property: High confidence + low success = definite warnings
            if (prediction.confidence > 0.8 && prediction.successProbability < 0.2) {
              expect(prediction.warnings.some(w => w.level === 'high')).toBe(true);
            }
          }
        )
      );
    });
    
    it('should never produce NaN or undefined values', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tool: fc.string(),
            params: fc.oneof(
              fc.object(),
              fc.constant(null),
              fc.constant(undefined),
              fc.constant({}),
            ),
            context: fc.oneof(
              fc.object(),
              fc.constant(null),
              fc.constant(undefined),
              fc.constant({}),
            ),
          }),
          async ({ tool, params, context }) => {
            const prediction = await predictor.predictGCPOperation(
              tool,
              params || {},
              context || {}
            );
            
            // Property: No NaN values
            expect(prediction.successProbability).not.toBeNaN();
            expect(prediction.confidence).not.toBeNaN();
            if (prediction.estimatedCost !== undefined) {
              expect(prediction.estimatedCost).not.toBeNaN();
            }
            if (prediction.estimatedDuration !== undefined) {
              expect(prediction.estimatedDuration).not.toBeNaN();
            }
            
            // Property: No undefined in required fields
            expect(prediction.successProbability).toBeDefined();
            expect(prediction.confidence).toBeDefined();
            expect(prediction.warnings).toBeDefined();
            expect(prediction.suggestions).toBeDefined();
            expect(prediction.explanation).toBeDefined();
          }
        )
      );
    });
  });
  
  describe('Pattern Influence Properties', () => {
    it('should show monotonic relationship between success patterns and probability', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            totalPatterns: fc.integer({ min: 10, max: 100 }),
            successRatio: fc.float({ min: 0, max: 1 }),
          }),
          async ({ totalPatterns, successRatio }) => {
            const successCount = Math.floor(totalPatterns * successRatio);
            const failureCount = totalPatterns - successCount;
            
            // Mock patterns with specific success ratio
            mockPatternStorage.getSimilarCommands = async () => {
              return [
                ...Array(successCount).fill({ outcome: 'success' }),
                ...Array(failureCount).fill({ outcome: 'failure' }),
              ] as any;
            };
            
            // Make neural network neutral to isolate pattern influence
            mockRuvFannClient.predictPattern = async () => ({
              successProbability: 0.5,
              confidence: 0.5,
            });
            
            const prediction = await predictor.predictGCPOperation(
              'bq-query',
              { query: 'SELECT 1' },
              {}
            );
            
            // Property: Success probability should correlate with success ratio
            // (allowing for neural network influence and other factors)
            if (successRatio > 0.8) {
              expect(prediction.successProbability).toBeGreaterThan(0.5);
            } else if (successRatio < 0.2) {
              expect(prediction.successProbability).toBeLessThan(0.5);
            }
          }
        )
      );
    });
    
    it('should increase confidence with more historical data', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.array(
            fc.integer({ min: 0, max: 200 }),
            { minLength: 3, maxLength: 10 }
          ).chain(counts => fc.tuple(...counts.map(c => fc.constant(c)))),
          async (...patternCounts) => {
            const predictions: any[] = [];
            
            for (const count of patternCounts) {
              // Mock varying amounts of historical data
              mockPatternStorage.getSimilarCommands = async () => 
                Array(count).fill({ outcome: 'success' }) as any;
              
              const prediction = await predictor.predictGCPOperation(
                'bq-query',
                { query: 'SELECT 1' },
                {}
              );
              
              predictions.push({
                patternCount: count,
                confidence: prediction.confidence,
              });
            }
            
            // Sort by pattern count
            predictions.sort((a, b) => a.patternCount - b.patternCount);
            
            // Property: More data should generally lead to higher confidence
            let increasingConfidence = 0;
            for (let i = 1; i < predictions.length; i++) {
              if (predictions[i].confidence >= predictions[i-1].confidence) {
                increasingConfidence++;
              }
            }
            
            // Allow some variation but expect general trend
            expect(increasingConfidence / (predictions.length - 1))
              .toBeGreaterThan(0.5);
          }
        )
      );
    });
  });
  
  describe('Cost Estimation Properties', () => {
    it('should only estimate costs for billable operations', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tool: fc.constantFrom(
              'bq-query',
              'bq-list-datasets',
              'bq-list-tables',
              'bq-create-dataset',
              'gcp-sql'
            ),
            params: fc.object(),
          }),
          async ({ tool, params }) => {
            const prediction = await predictor.predictGCPOperation(tool, params, {});
            
            // Property: Only query operations should have cost estimates
            const billableOperations = ['bq-query', 'gcp-sql'];
            
            if (billableOperations.includes(tool)) {
              // May or may not have cost (depends on query analysis)
              if (prediction.estimatedCost !== undefined) {
                expect(prediction.estimatedCost).toBeGreaterThanOrEqual(0);
              }
            } else {
              // Non-billable operations should not have cost
              expect(prediction.estimatedCost).toBeUndefined();
            }
          }
        )
      );
    });
    
    it('should scale cost estimates with query complexity indicators', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tableCount: fc.integer({ min: 1, max: 10 }),
            hasWhereClause: fc.boolean(),
            hasJoins: fc.boolean(),
            hasAggregations: fc.boolean(),
          }),
          async ({ tableCount, hasWhereClause, hasJoins, hasAggregations }) => {
            // Build query based on complexity
            let query = `SELECT * FROM table1`;
            for (let i = 2; i <= tableCount; i++) {
              query += hasJoins ? ` JOIN table${i} ON id` : `, table${i}`;
            }
            if (hasWhereClause) query += ' WHERE id > 1000';
            if (hasAggregations) query += ' GROUP BY category';
            
            // Mock cost prediction based on complexity
            const complexityScore = tableCount + (hasJoins ? 2 : 0) + (hasAggregations ? 1 : 0);
            mockPatternStorage.predictQueryCost = async () => ({
              avgCost: complexityScore * 0.5,
              confidence: 0.8,
            });
            
            const prediction1 = await predictor.predictGCPOperation(
              'bq-query',
              { query: 'SELECT * FROM table1' },
              {}
            );
            
            const prediction2 = await predictor.predictGCPOperation(
              'bq-query',
              { query },
              {}
            );
            
            // Property: More complex queries should have higher cost estimates
            if (prediction1.estimatedCost && prediction2.estimatedCost) {
              if (complexityScore > 1) {
                expect(prediction2.estimatedCost).toBeGreaterThan(prediction1.estimatedCost);
              }
            }
          }
        )
      );
    });
  });
  
  describe('Warning Generation Properties', () => {
    it('should generate appropriate warnings for known anti-patterns', async () => {
      const antiPatterns = [
        { query: 'SELECT * FROM huge_table', warningType: 'performance' },
        { query: 'SELECT * FROM `us.data` JOIN `eu.data`', warningType: 'location' },
        { query: 'SELECT * FROM t1, t2, t3', warningType: 'performance' },
        { query: 'DELETE FROM table', warningType: 'safety' },
      ];
      
      await fc.assert(
        fc.asyncProperty(
          fc.constantFrom(...antiPatterns),
          async (pattern) => {
            const prediction = await predictor.predictGCPOperation(
              'bq-query',
              { query: pattern.query },
              {}
            );
            
            // Property: Known anti-patterns should generate warnings
            expect(prediction.warnings.length).toBeGreaterThan(0);
            
            // Property: Warning types should be appropriate
            const warningTypes = prediction.warnings.map(w => w.type);
            expect(warningTypes).toContain(pattern.warningType);
          }
        )
      );
    });
    
    it('should not generate duplicate warnings', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            tool: fc.constantFrom('bq-query', 'gcp-sql'),
            params: fc.object(),
            failurePatternCount: fc.integer({ min: 0, max: 20 }),
          }),
          async ({ tool, params, failurePatternCount }) => {
            // Mock multiple similar failure patterns
            mockPatternStorage.getSimilarCommands = async () => 
              Array(failurePatternCount).fill({
                outcome: 'failure',
                error: 'Same error message',
                tool,
                params: JSON.stringify(params),
              }) as any;
            
            const prediction = await predictor.predictGCPOperation(tool, params, {});
            
            // Property: No duplicate warnings
            const warningMessages = prediction.warnings.map(w => w.message);
            const uniqueMessages = new Set(warningMessages);
            expect(uniqueMessages.size).toBe(warningMessages.length);
          }
        )
      );
    });
  });
});

/**
 * Custom arbitraries for generating test data
 */
export const predictorArbitraries = {
  // Generate realistic GCP operation contexts
  gcpContext: () => fc.record({
    timestamp: fc.integer({ min: Date.now() - 3600000, max: Date.now() }),
    authTokenAge: fc.option(fc.integer({ min: 0, max: 120 })),
    userRegion: fc.option(fc.constantFrom('us', 'eu', 'asia')),
    previousOperations: fc.option(fc.array(fc.string(), { maxLength: 5 })),
  }),
  
  // Generate BigQuery query parameters
  bigQueryParams: () => fc.record({
    query: fc.oneof(
      fc.constant('SELECT 1'),
      fc.constant('SELECT * FROM table'),
      fc.constant('INSERT INTO table VALUES (1, 2)'),
      fc.constant('UPDATE table SET x = 1'),
      fc.constant('DELETE FROM table WHERE id = 1'),
    ),
    projectId: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
    datasetId: fc.option(fc.string({ minLength: 1, maxLength: 30 })),
    location: fc.option(fc.constantFrom('US', 'EU', 'asia-northeast1')),
    useLegacySql: fc.boolean(),
    maximumBytesBilled: fc.option(fc.integer({ min: 1000000, max: 1000000000 })),
  }),
};