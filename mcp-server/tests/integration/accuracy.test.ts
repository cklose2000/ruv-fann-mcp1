import { GCPPredictor } from '../../src/predictors/gcp-predictor.js';
import { RuvFannClient } from '../../src/clients/ruv-fann-client.js';
import { GCPPatternStorage } from '../../src/storage/gcp-pattern-storage.js';
import { TestDataGenerator } from '../fixtures/test-data-generator.js';
import { MockFactory } from '../utils/mock-factory.js';
import { TestHelpers } from '../utils/test-helpers.js';
import { TestPattern, TestResult, TestMetrics } from '../types/test-types.js';
import fs from 'fs';
import path from 'path';

/**
 * Integration tests for prediction accuracy measurement
 */
describe('Prediction Accuracy Integration Tests', () => {
  let predictor: GCPPredictor;
  let patternStorage: GCPPatternStorage;
  let ruvFannClient: RuvFannClient;
  let testDataGenerator: TestDataGenerator;
  let testDbPath: string;

  beforeAll(async () => {
    // Setup test databases
    const testDir = path.join(process.cwd(), 'tests', 'fixtures', 'integration');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    testDbPath = path.join(testDir, 'accuracy-test.db');
    
    // Initialize components
    patternStorage = new GCPPatternStorage(testDbPath);
    ruvFannClient = new RuvFannClient({
      coreUrl: process.env.RUV_FANN_CORE_URL || 'http://localhost:8090',
      swarmUrl: process.env.RUV_FANN_SWARM_URL || 'http://localhost:8081',
      modelUrl: process.env.RUV_FANN_MODEL_URL || 'http://localhost:8082',
    });
    
    predictor = new GCPPredictor(ruvFannClient, patternStorage);
    
    // Generate test data
    testDataGenerator = new TestDataGenerator(
      path.join(testDir, 'patterns.db'),
      testDbPath
    );
    await testDataGenerator.seedTestData();
  });

  afterAll(() => {
    // Cleanup
    testDataGenerator.close();
    const testDir = path.join(process.cwd(), 'tests', 'fixtures', 'integration');
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true });
    }
  });

  describe('BigQuery Failure Prediction Accuracy', () => {
    it('should accurately predict syntax errors', async () => {
      // Arrange
      const syntaxErrorPatterns = MockFactory.createBigQueryFailurePatterns()
        .filter(p => p.expectedError?.includes('Syntax error'));
      
      const results: TestResult[] = [];

      // Act
      for (const pattern of syntaxErrorPatterns) {
        const prediction = await predictor.predictGCPOperation(
          pattern.tool,
          pattern.params,
          { timestamp: Date.now() }
        );

        const actualOutcome = simulateGCPOperation(pattern);
        
        results.push({
          pattern,
          prediction,
          actual: actualOutcome,
          accuracy: {
            outcomeCorrect: 
              (prediction.successProbability > 0.5 && actualOutcome.outcome === 'success') ||
              (prediction.successProbability <= 0.5 && actualOutcome.outcome === 'failure'),
            costError: actualOutcome.cost ? 
              Math.abs((prediction.estimatedCost || 0) - actualOutcome.cost) : undefined,
            durationError: Math.abs((prediction.estimatedDuration || 0) - actualOutcome.duration),
          },
        });
      }

      // Assert
      const metrics = TestHelpers.calculateMetrics(results);
      
      expect(metrics.predictionAccuracy).toBeGreaterThan(0.7); // 70% accuracy target
      expect(metrics.falseNegativeRate).toBeLessThan(0.3); // Don't miss too many failures
      
      // Log detailed results
      console.log('Syntax Error Prediction Results:', {
        totalTests: results.length,
        accuracy: `${(metrics.predictionAccuracy * 100).toFixed(1)}%`,
        falsePositiveRate: `${(metrics.falsePositiveRate * 100).toFixed(1)}%`,
        falseNegativeRate: `${(metrics.falseNegativeRate * 100).toFixed(1)}%`,
      });
    });

    it('should accurately predict permission errors', async () => {
      // Arrange
      const permissionPatterns = MockFactory.createBigQueryFailurePatterns()
        .filter(p => p.expectedError?.includes('Permission denied') || 
                     p.expectedError?.includes('access denied'));

      const results: TestResult[] = [];

      // Act
      for (const pattern of permissionPatterns) {
        const prediction = await predictor.predictGCPOperation(
          pattern.tool,
          pattern.params,
          {}
        );

        results.push(createTestResult(pattern, prediction));
      }

      // Assert
      const metrics = TestHelpers.calculateMetrics(results);
      expect(metrics.predictionAccuracy).toBeGreaterThan(0.75);
      
      // Permission errors should be highly predictable
      const permissionWarnings = results.filter(r => 
        r.prediction.warnings.some(w => w.type === 'permission')
      );
      expect(permissionWarnings.length).toBeGreaterThan(permissionPatterns.length * 0.5);
    });

    it('should accurately predict cost overruns', async () => {
      // Arrange
      const costPatterns = MockFactory.createBigQueryFailurePatterns()
        .filter(p => p.expectedCost && p.expectedCost > 5.0);

      const results: TestResult[] = [];

      // Act
      for (const pattern of costPatterns) {
        const prediction = await predictor.predictGCPOperation(
          pattern.tool,
          pattern.params,
          {}
        );

        results.push(createTestResult(pattern, prediction));
      }

      // Assert
      const costEstimationErrors = results
        .filter(r => r.prediction.estimatedCost !== undefined)
        .map(r => r.accuracy.costError || 0);
      
      const avgCostError = costEstimationErrors.reduce((a, b) => a + b, 0) / costEstimationErrors.length;
      
      expect(avgCostError).toBeLessThan(2.0); // Average error less than $2
      
      // Should warn about high-cost queries
      const costWarnings = results.filter(r => 
        r.prediction.warnings.some(w => w.type === 'cost' && w.level === 'high')
      );
      expect(costWarnings.length).toBeGreaterThan(0);
    });
  });

  describe('Learning Effectiveness', () => {
    it('should improve prediction accuracy with more patterns', async () => {
      // Arrange
      const testTool = 'bq-query';
      const testQuery = 'SELECT * FROM problematic_table WHERE status = ?';
      
      // Create a specific failure pattern
      const failurePattern: TestPattern = {
        scenario: 'Repeated failure pattern',
        tool: testTool,
        params: { query: testQuery },
        expectedOutcome: 'failure',
        expectedError: 'Table scan timeout',
      };

      // Initial prediction (before learning)
      const initialPrediction = await predictor.predictGCPOperation(
        failurePattern.tool,
        failurePattern.params,
        {}
      );

      // Record multiple failures
      for (let i = 0; i < 20; i++) {
        await patternStorage.recordCommandPattern({
          tool: testTool,
          params: JSON.stringify(failurePattern.params),
          context: JSON.stringify({ timestamp: Date.now() - i * 1000 }),
          outcome: 'failure',
          duration: 5000,
          error: 'Table scan timeout',
        });
      }

      // Act - Prediction after learning
      const improvedPrediction = await predictor.predictGCPOperation(
        failurePattern.tool,
        failurePattern.params,
        {}
      );

      // Assert
      expect(improvedPrediction.successProbability).toBeLessThan(initialPrediction.successProbability);
      expect(improvedPrediction.confidence).toBeGreaterThan(initialPrediction.confidence);
      expect(improvedPrediction.warnings.length).toBeGreaterThan(initialPrediction.warnings.length);
    });

    it('should detect error patterns across similar queries', async () => {
      // Arrange
      const baseQuery = 'SELECT * FROM large_table';
      const variations = [
        `${baseQuery} WHERE id > 1000000`,
        `${baseQuery} ORDER BY timestamp`,
        `${baseQuery} JOIN another_large_table`,
      ];

      // Record failures for all variations
      for (const query of variations) {
        for (let i = 0; i < 5; i++) {
          await patternStorage.recordCommandPattern({
            tool: 'bq-query',
            params: JSON.stringify({ query }),
            context: JSON.stringify({ timestamp: Date.now() }),
            outcome: 'failure',
            duration: 10000,
            error: 'Resources exceeded',
          });
        }
      }

      // Act - Test prediction on new similar query
      const newQuery = `${baseQuery} WHERE status = 'active'`;
      const prediction = await predictor.predictGCPOperation(
        'bq-query',
        { query: newQuery },
        {}
      );

      // Assert
      expect(prediction.successProbability).toBeLessThan(0.3);
      expect(prediction.warnings).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('large_table'),
        })
      );
    });
  });

  describe('Authentication Pattern Recognition', () => {
    it('should predict auth failures based on token age', async () => {
      // Arrange
      // Seed auth failure patterns
      await testDataGenerator.generateScenarioData('auth_failures');

      const results: TestResult[] = [];
      const tokenAges = [15, 30, 45, 60, 75, 90]; // Minutes

      // Act
      for (const tokenAge of tokenAges) {
        const prediction = await predictor.predictGCPOperation(
          'bq-list-datasets',
          { projectId: 'test-project' },
          { authTokenAge: tokenAge }
        );

        const expectedSuccess = tokenAge < 60; // Tokens expire at 60 minutes
        
        results.push({
          pattern: {
            scenario: `Token age ${tokenAge} minutes`,
            tool: 'bq-list-datasets',
            params: { projectId: 'test-project' },
            expectedOutcome: expectedSuccess ? 'success' : 'failure',
          },
          prediction,
          actual: {
            outcome: expectedSuccess ? 'success' : 'failure',
            duration: 200,
          },
          accuracy: {
            outcomeCorrect: 
              (prediction.successProbability > 0.5) === expectedSuccess,
          },
        });
      }

      // Assert
      const metrics = TestHelpers.calculateMetrics(results);
      expect(metrics.predictionAccuracy).toBeGreaterThan(0.8);

      // Should warn about old tokens
      const oldTokenResults = results.filter(r => 
        r.pattern.params.authTokenAge >= 60
      );
      const oldTokenWarnings = oldTokenResults.filter(r =>
        r.prediction.warnings.some(w => w.type === 'auth')
      );
      expect(oldTokenWarnings.length).toBe(oldTokenResults.length);
    });
  });

  describe('Cross-Region Query Detection', () => {
    it('should detect and warn about cross-region queries', async () => {
      // Arrange
      const crossRegionPatterns: TestPattern[] = [
        {
          scenario: 'US-EU cross-region join',
          tool: 'bq-query',
          params: {
            query: 'SELECT * FROM `us.dataset.table` JOIN `eu.dataset.table` USING(id)',
            location: 'US',
          },
          expectedOutcome: 'failure',
          expectedError: 'Cross-region joins are not allowed',
        },
        {
          scenario: 'Asia-US cross-region union',
          tool: 'bq-query',
          params: {
            query: 'SELECT * FROM `asia-northeast1.data.table` UNION ALL SELECT * FROM `us-central1.data.table`',
            location: 'asia-northeast1',
          },
          expectedOutcome: 'failure',
          expectedError: 'Cannot query across regions',
        },
      ];

      // Act
      const results: TestResult[] = [];
      for (const pattern of crossRegionPatterns) {
        const prediction = await predictor.predictGCPOperation(
          pattern.tool,
          pattern.params,
          {}
        );
        results.push(createTestResult(pattern, prediction));
      }

      // Assert
      // All cross-region queries should be predicted to fail
      const correctPredictions = results.filter(r => 
        r.prediction.successProbability < 0.5
      );
      expect(correctPredictions.length).toBe(crossRegionPatterns.length);

      // All should have location warnings
      const locationWarnings = results.filter(r =>
        r.prediction.warnings.some(w => w.type === 'location')
      );
      expect(locationWarnings.length).toBe(crossRegionPatterns.length);
    });
  });

  // Helper function to create test results
  function createTestResult(pattern: TestPattern, prediction: any): TestResult {
    const actualOutcome = simulateGCPOperation(pattern);
    
    return {
      pattern,
      prediction,
      actual: actualOutcome,
      accuracy: {
        outcomeCorrect: 
          (prediction.successProbability > 0.5 && actualOutcome.outcome === 'success') ||
          (prediction.successProbability <= 0.5 && actualOutcome.outcome === 'failure'),
        costError: actualOutcome.cost && prediction.estimatedCost ? 
          Math.abs(prediction.estimatedCost - actualOutcome.cost) : undefined,
        durationError: Math.abs((prediction.estimatedDuration || 0) - actualOutcome.duration),
      },
    };
  }

  // Simulate GCP operation outcome based on pattern
  function simulateGCPOperation(pattern: TestPattern): any {
    // Add some randomness to simulate real-world variance
    const variance = 0.9 + Math.random() * 0.2; // ±10% variance
    
    return {
      outcome: pattern.expectedOutcome,
      error: pattern.expectedError,
      cost: pattern.expectedCost ? pattern.expectedCost * variance : undefined,
      duration: Math.floor((pattern.expectedDuration || 1000) * variance),
    };
  }
});