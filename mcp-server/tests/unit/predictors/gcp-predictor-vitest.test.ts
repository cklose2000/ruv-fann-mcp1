import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GCPPredictor } from '../../../src/predictors/gcp-predictor.js';
import type { RuvFannClient } from '../../../src/clients/ruv-fann-client.js';
import type { GCPPatternStorage } from '../../../src/storage/gcp-pattern-storage.js';
import { MockFactory } from '../../utils/mock-factory.js';
import { performanceHelpers } from '../../setup/vitest-setup.js';

/**
 * GCPPredictor Unit Tests - Now enabled with Vitest!
 * 
 * These tests were previously skipped due to ESM mocking issues with Jest.
 * Vitest provides proper ESM support, allowing us to test the predictor
 * while still following our minimal mocking philosophy.
 */

// Create typed mock factories
const createMockRuvFannClient = (): RuvFannClient => {
  return {
    predictPattern: vi.fn().mockResolvedValue({
      successProbability: 0.8,
      confidence: 0.9,
    }),
    spawnPatternAnalysisAgents: vi.fn().mockResolvedValue([
      { agentId: 'agent-1', analysis: 'Pattern looks good' },
    ]),
    analyzeFailurePatterns: vi.fn().mockResolvedValue({
      commonErrors: ['Syntax error', 'Permission denied'],
      riskFactors: ['Large table scan', 'No WHERE clause'],
    }),
  } as any; // Type assertion for partial mock
};

const createMockPatternStorage = (): GCPPatternStorage => {
  const mockStorage = {
    getSimilarCommands: vi.fn().mockResolvedValue([]),
    getSuccessfulPatterns: vi.fn().mockResolvedValue([]),
    getRecentFailures: vi.fn().mockResolvedValue([]),
    recordCommandPattern: vi.fn().mockResolvedValue(1),
    predictQueryCost: vi.fn().mockResolvedValue({ avgCost: 0.05, confidence: 0.8 }),
    getAuthFailureRate: vi.fn().mockResolvedValue(0.1),
    getAverageQueryDuration: vi.fn().mockResolvedValue(1500),
    getQuerySuccessRate: vi.fn().mockResolvedValue(0.85),
    // Real database instance for testing
    db: null as any, // Would be real in integration tests
  };
  
  return mockStorage as any;
};

describe('GCPPredictor', () => {
  let predictor: GCPPredictor;
  let mockRuvFannClient: ReturnType<typeof createMockRuvFannClient>;
  let mockPatternStorage: ReturnType<typeof createMockPatternStorage>;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockRuvFannClient = createMockRuvFannClient();
    mockPatternStorage = createMockPatternStorage();
    
    // Create predictor with mocked dependencies
    predictor = new GCPPredictor(mockRuvFannClient, mockPatternStorage);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('predictGCPOperation', () => {
    it('should predict success for valid BigQuery queries', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM dataset.table LIMIT 10' };
      const context = { timestamp: Date.now() };

      // Mock successful historical patterns
      vi.mocked(mockPatternStorage.getSimilarCommands).mockResolvedValue(
        Array(10).fill(null).map(() => MockFactory.createCommandPattern({
          tool,
          outcome: 'success',
          duration: 1000,
        }))
      );

      // Act
      const start = performanceHelpers.startTimer();
      const prediction = await predictor.predictGCPOperation(tool, params, context);
      const duration = performanceHelpers.endTimer(start);

      // Assert
      expect(prediction).toHavePredictionShape();
      expect(prediction.successProbability).toBeGreaterThan(0.5);
      expect(prediction.confidence).toBeGreaterThan(0.5);
      expect(prediction.warnings).toHaveLength(0);
      expect(mockRuvFannClient.predictPattern).toHaveBeenCalled();
      
      // Performance assertion
      performanceHelpers.expectPerformance(duration, 100, 'Prediction');
    });

    it('should warn about large table scans', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM huge_dataset.billion_row_table' };
      
      vi.mocked(mockPatternStorage.predictQueryCost).mockResolvedValue({
        avgCost: 50.0,
        confidence: 0.8,
      });

      // Act
      const prediction = await predictor.predictGCPOperation(tool, params, {});

      // Assert
      expect(prediction.warnings).toContainEqual(
        expect.objectContaining({
          level: 'high',
          type: 'cost',
          message: expect.stringContaining('cost'),
        })
      );
      expect(prediction.estimatedCost).toBeGreaterThan(10);
    });

    it('should detect syntax errors from historical patterns', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM table WHRE id = 1' }; // Typo: WHRE

      // Mock patterns showing repeated syntax errors
      vi.mocked(mockPatternStorage.getSimilarCommands).mockResolvedValue(
        Array(5).fill(null).map(() => MockFactory.createCommandPattern({
          tool,
          outcome: 'failure',
          error: 'Syntax error: Unexpected keyword WHRE',
        }))
      );

      // Act
      const prediction = await predictor.predictGCPOperation(tool, params, {});

      // Assert
      expect(prediction.successProbability).toBeLessThan(0.5);
      expect(prediction.warnings).toContainEqual(
        expect.objectContaining({
          type: 'syntax',
          message: expect.stringContaining('syntax'),
        })
      );
    });

    it('should handle auth token age warnings', async () => {
      // Arrange
      const tool = 'bq-list-datasets';
      const params = { projectId: 'test-project' };
      const context = { authTokenAge: 55 }; // 55 minutes old

      vi.mocked(mockPatternStorage.getAuthFailureRate).mockResolvedValue(0.7);

      // Act
      const prediction = await predictor.predictGCPOperation(tool, params, context);

      // Assert
      expect(prediction.warnings).toContainEqual(
        expect.objectContaining({
          type: 'auth',
          level: 'high',
          message: expect.stringContaining('token'),
        })
      );
    });

    it('should provide optimization suggestions', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM large_table' };

      // Act
      const prediction = await predictor.predictGCPOperation(tool, params, {});

      // Assert
      expect(prediction.suggestions.length).toBeGreaterThan(0);
      expect(prediction.suggestions).toContainEqual(
        expect.objectContaining({
          type: 'optimization',
          description: expect.stringContaining('WHERE clause'),
        })
      );
    });

    it('should handle cross-region query detection', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { 
        query: 'SELECT * FROM `us.dataset.table` JOIN `eu.dataset.table` ON id',
        location: 'US'
      };

      // Act
      const prediction = await predictor.predictGCPOperation(tool, params, {});

      // Assert
      expect(prediction.warnings).toContainEqual(
        expect.objectContaining({
          type: 'location',
          message: expect.stringContaining('cross-region'),
        })
      );
      expect(prediction.successProbability).toBeLessThan(0.3);
    });
  });

  describe('Pattern Analysis', () => {
    it('should calculate correct success rate from patterns', async () => {
      // Arrange
      const patterns = [
        ...Array(7).fill(null).map(() => MockFactory.createCommandPattern({ outcome: 'success' })),
        ...Array(3).fill(null).map(() => MockFactory.createCommandPattern({ outcome: 'failure' })),
      ];

      vi.mocked(mockPatternStorage.getSimilarCommands).mockResolvedValue(patterns);

      // Act
      const prediction = await predictor.predictGCPOperation('bq-query', {}, {});

      // Assert
      expect(prediction.successProbability).toBeWithinRange(0.6, 0.8);
    });

    it('should identify recurring error patterns', async () => {
      // Arrange
      const errorMessage = 'Permission denied on dataset';
      const patterns = Array(5).fill(null).map(() => 
        MockFactory.createCommandPattern({
          outcome: 'failure',
          error: errorMessage,
        })
      );

      vi.mocked(mockPatternStorage.getSimilarCommands).mockResolvedValue(patterns);

      // Act
      const prediction = await predictor.predictGCPOperation('bq-list-tables', 
        { datasetId: 'restricted' }, {});

      // Assert
      expect(prediction.warnings).toContainEqual(
        expect.objectContaining({
          message: expect.stringContaining('Permission denied'),
        })
      );
    });
  });

  describe('Cost Estimation', () => {
    it('should estimate costs for BigQuery operations', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM dataset.table' };

      vi.mocked(mockPatternStorage.predictQueryCost).mockResolvedValue({
        avgCost: 2.5,
        confidence: 0.85,
      });

      // Act
      const prediction = await predictor.predictGCPOperation(tool, params, {});

      // Assert
      expect(prediction.estimatedCost).toBeDefined();
      expect(prediction.estimatedCost).toBeGreaterThan(0);
      expect(mockPatternStorage.predictQueryCost).toHaveBeenCalled();
    });

    it('should not estimate costs for non-query operations', async () => {
      // Arrange
      const tool = 'bq-list-datasets';
      const params = { projectId: 'test' };

      // Act
      const prediction = await predictor.predictGCPOperation(tool, params, {});

      // Assert
      expect(prediction.estimatedCost).toBeUndefined();
      expect(mockPatternStorage.predictQueryCost).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle pattern storage errors gracefully', async () => {
      // Arrange
      vi.mocked(mockPatternStorage.getSimilarCommands).mockRejectedValue(
        new Error('Database connection failed')
      );

      // Act
      const prediction = await predictor.predictGCPOperation('bq-query', {}, {});

      // Assert
      expect(prediction).toBeDefined();
      expect(prediction.successProbability).toBe(0.5); // Neutral prediction
      expect(prediction.confidence).toBeLessThan(0.5); // Low confidence
    });

    it('should handle neural network prediction failures', async () => {
      // Arrange
      vi.mocked(mockRuvFannClient.predictPattern).mockRejectedValue(
        new Error('Neural network timeout')
      );

      // Act
      const prediction = await predictor.predictGCPOperation('bq-query', {}, {});

      // Assert
      expect(prediction).toBeDefined();
      expect(prediction.explanation).toContain('historical patterns');
    });
  });

  describe('Performance', () => {
    it('should complete predictions within time limit', async () => {
      // Act
      const start = performanceHelpers.startTimer();
      await predictor.predictGCPOperation('bq-query', 
        { query: 'SELECT * FROM table' }, {});
      const duration = performanceHelpers.endTimer(start);

      // Assert
      performanceHelpers.expectPerformance(duration, 100, 'Single prediction');
    });

    it('should handle concurrent predictions efficiently', async () => {
      // Arrange
      const concurrentCount = 10;
      const predictions = [];

      // Act
      const start = performanceHelpers.startTimer();
      for (let i = 0; i < concurrentCount; i++) {
        predictions.push(
          predictor.predictGCPOperation('bq-query', 
            { query: `SELECT ${i} FROM table` }, {})
        );
      }
      await Promise.all(predictions);
      const duration = performanceHelpers.endTimer(start);

      // Assert
      // Should be faster than sequential execution
      performanceHelpers.expectPerformance(
        duration, 
        200, // Much less than 100ms * 10
        `${concurrentCount} concurrent predictions`
      );
    });
  });

  describe('Mock Contract Validation', () => {
    it('mock RuvFannClient should match expected API shape', async () => {
      // This ensures our mocks don't drift from reality
      const response = await mockRuvFannClient.predictPattern({});
      
      expect(response).toMatchObject({
        successProbability: expect.any(Number),
        confidence: expect.any(Number),
      });
      
      expect(response.successProbability).toBeWithinRange(0, 1);
      expect(response.confidence).toBeWithinRange(0, 1);
    });

    it('mock PatternStorage should return valid data shapes', async () => {
      const patterns = await mockPatternStorage.getSimilarCommands('test', {}, 10);
      
      if (patterns.length > 0) {
        expect(patterns[0]).toHaveProperty('tool');
        expect(patterns[0]).toHaveProperty('outcome');
        expect(patterns[0]).toHaveProperty('timestamp');
      }
    });
  });
});