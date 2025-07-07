import { jest } from '@jest/globals';
import { GCPPredictor } from '../../../src/predictors/gcp-predictor.js';
import { RuvFannClient } from '../../../src/clients/ruv-fann-client.js';
import { GCPPatternStorage } from '../../../src/storage/gcp-pattern-storage.js';
import { TestHelpers } from '../../utils/test-helpers.js';
import { MockFactory } from '../../utils/mock-factory.js';

// Mock dependencies
jest.mock('../../../src/clients/ruv-fann-client.js');
jest.mock('../../../src/storage/gcp-pattern-storage.js');

describe('GCPPredictor', () => {
  let predictor: GCPPredictor;
  let mockRuvFannClient: jest.Mocked<RuvFannClient>;
  let mockPatternStorage: jest.Mocked<GCPPatternStorage>;

  beforeEach(() => {
    // Create mock instances
    mockRuvFannClient = new RuvFannClient({
      coreUrl: 'http://localhost:8090',
      swarmUrl: 'http://localhost:8081',
      modelUrl: 'http://localhost:8082',
    }) as jest.Mocked<RuvFannClient>;

    mockPatternStorage = new GCPPatternStorage() as jest.Mocked<GCPPatternStorage>;

    // Create predictor instance
    predictor = new GCPPredictor(mockRuvFannClient, mockPatternStorage);

    // Setup default mocks
    mockRuvFannClient.predictPattern.mockResolvedValue({
      successProbability: 0.8,
      confidence: 0.9,
    });

    mockPatternStorage.getSimilarCommands.mockResolvedValue([]);
    mockPatternStorage.getSuccessfulPatterns.mockResolvedValue([]);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('predictGCPOperation', () => {
    it('should predict success for valid BigQuery queries', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM dataset.table LIMIT 10' };
      const context = { timestamp: Date.now() };

      mockPatternStorage.getSimilarCommands.mockResolvedValue(
        Array(10).fill(null).map(() => MockFactory.createCommandPattern({
          tool,
          outcome: 'success',
          duration: 1000,
        }))
      );

      // Act
      const prediction = await predictor.predictGCPOperation(tool, params, context);

      // Assert
      expect(prediction.successProbability).toBeGreaterThan(0.5);
      expect(prediction.confidence).toBeGreaterThan(0.5);
      expect(prediction.warnings).toHaveLength(0);
      expect(mockRuvFannClient.predictPattern).toHaveBeenCalled();
    });

    it('should warn about large table scans', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM huge_dataset.billion_row_table' };
      
      mockPatternStorage.predictQueryCost.mockResolvedValue({
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

    it('should detect syntax errors from patterns', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM table WHRE id = 1' }; // Typo: WHRE

      mockPatternStorage.getSimilarCommands.mockResolvedValue(
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

      mockPatternStorage.getAuthFailureRate.mockResolvedValue(0.7); // 70% failure rate

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
        query: 'SELECT * FROM us.dataset.table JOIN eu.dataset.table ON id',
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

      mockPatternStorage.getSimilarCommands.mockResolvedValue(patterns);

      // Act
      const prediction = await predictor.predictGCPOperation('bq-query', {}, {});

      // Assert
      // Success rate should influence the prediction
      expect(prediction.successProbability).toBeCloseTo(0.7, 1);
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

      mockPatternStorage.getSimilarCommands.mockResolvedValue(patterns);

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

      mockPatternStorage.predictQueryCost.mockResolvedValue({
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
      mockPatternStorage.getSimilarCommands.mockRejectedValue(
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
      mockRuvFannClient.predictPattern.mockRejectedValue(
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
      // Arrange
      const startTime = Date.now();

      // Act
      await predictor.predictGCPOperation('bq-query', 
        { query: 'SELECT * FROM table' }, {});

      // Assert
      const duration = Date.now() - startTime;
      expect(duration).toBeLessThan(100); // Should complete within 100ms
    });

    it('should use parallel analysis for efficiency', async () => {
      // Arrange
      const spawnAgentsSpy = jest.spyOn(mockRuvFannClient, 'spawnPatternAnalysisAgents');

      // Act
      await predictor.predictGCPOperation('bq-query', {}, {});

      // Assert
      expect(spawnAgentsSpy).toHaveBeenCalled();
      // Verify parallel execution by checking Promise.all usage
    });
  });
});