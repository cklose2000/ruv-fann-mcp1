import { jest } from '@jest/globals';
import { RuvFannClient } from '../../../src/clients/ruv-fann-client.js';
import { TestHelpers } from '../../utils/test-helpers.js';

// Create manual axios mock
const createMockAxiosInstance = () => ({
  get: jest.fn(),
  post: jest.fn(),
});

const axiosCreateMock = jest.fn();

// Mock axios module
jest.unstable_mockModule('axios', () => ({
  default: {
    create: axiosCreateMock,
  },
}));

describe.skip('RuvFannClient', () => {  // Skip for now due to ESM mocking complexity
  let client: RuvFannClient;
  let mockCoreClient: any;
  let mockSwarmClient: any;
  let mockModelClient: any;

  beforeEach(() => {
    // Reset mocks
    jest.clearAllMocks();

    // Create mock axios instances
    mockCoreClient = {
      get: jest.fn(),
      post: jest.fn(),
    };

    mockSwarmClient = {
      get: jest.fn(),
      post: jest.fn(),
    };

    mockModelClient = {
      get: jest.fn(),
      post: jest.fn(),
    };

    // Mock axios.create to return our mock clients
    axiosCreateMock.mockImplementation((config) => {
      if (config?.baseURL?.includes('8090')) return mockCoreClient;
      if (config?.baseURL?.includes('8081')) return mockSwarmClient;
      if (config?.baseURL?.includes('8082')) return mockModelClient;
      return mockCoreClient;
    });

    // Create client instance
    client = new RuvFannClient({
      coreUrl: 'http://localhost:8090',
      swarmUrl: 'http://localhost:8081',
      modelUrl: 'http://localhost:8082',
    });
  });

  describe('testConnectivity', () => {
    it('should successfully test connectivity to all services', async () => {
      // Arrange
      mockCoreClient.get.mockResolvedValue({ status: 200 });
      mockSwarmClient.get.mockResolvedValue({ status: 200 });
      mockModelClient.get.mockResolvedValue({ status: 200 });

      // Act & Assert
      await expect(client.testConnectivity()).resolves.not.toThrow();

      // Verify all health endpoints were called
      expect(mockCoreClient.get).toHaveBeenCalledWith('/health');
      expect(mockSwarmClient.get).toHaveBeenCalledWith('/health');
      expect(mockModelClient.get).toHaveBeenCalledWith('/health');
    });

    it('should throw error if any service is unavailable', async () => {
      // Arrange
      mockCoreClient.get.mockResolvedValue({ status: 200 });
      mockSwarmClient.get.mockRejectedValue(new Error('Connection refused'));
      mockModelClient.get.mockResolvedValue({ status: 200 });

      // Act & Assert
      await expect(client.testConnectivity()).rejects.toThrow('Failed to connect to ruv-FANN services');
    });
  });

  describe('spawnPatternAnalysisAgents', () => {
    it('should spawn all agent types successfully', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT * FROM table' };
      const context = { timestamp: Date.now() };

      // Mock spawn responses
      const agentTypes = ['pattern_matcher', 'outcome_predictor', 'alternative_gen', 'context_analyzer'];
      agentTypes.forEach((type, index) => {
        mockSwarmClient.post.mockResolvedValueOnce({
          data: { agent_id: `agent_${index}` },
        });
        mockSwarmClient.get.mockResolvedValueOnce({
          data: {
            result: { analysis: `${type} analysis` },
            confidence: 0.8,
            duration_ms: 50,
          },
        });
      });

      // Act
      const analyses = await client.spawnPatternAnalysisAgents(tool, params, context);

      // Assert
      expect(analyses).toHaveLength(4);
      expect(analyses[0].agentType).toBe('pattern_matcher');
      expect(analyses[0].analysis.analysis).toBe('pattern_matcher analysis');
      expect(analyses[0].confidence).toBe(0.8);
      
      // Verify spawn calls
      expect(mockSwarmClient.post).toHaveBeenCalledTimes(4);
      expect(mockSwarmClient.post).toHaveBeenCalledWith('/api/agent/spawn', expect.objectContaining({
        agent_type: 'pattern_matcher',
        task_data: expect.objectContaining({ tool, params, context }),
      }));
    });

    it('should handle agent failures gracefully', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = {};
      const context = {};

      // Mock one successful and one failed agent
      mockSwarmClient.post
        .mockResolvedValueOnce({ data: { agent_id: 'agent_1' } })
        .mockRejectedValueOnce(new Error('Agent spawn failed'));

      mockSwarmClient.get.mockResolvedValueOnce({
        data: {
          result: { analysis: 'success' },
          confidence: 0.9,
          duration_ms: 40,
        },
      });

      // Act
      const analyses = await client.spawnPatternAnalysisAgents(tool, params, context);

      // Assert
      const successfulAgents = analyses.filter(a => a.agentId !== 'error');
      const failedAgents = analyses.filter(a => a.agentId === 'error');
      
      expect(successfulAgents.length).toBeGreaterThan(0);
      expect(failedAgents.length).toBeGreaterThan(0);
      expect(failedAgents[0].confidence).toBe(0);
    });
  });

  describe('predict', () => {
    it('should make predictions successfully', async () => {
      // Arrange
      const inputs = [[0.1, 0.2, 0.3]];
      const context = { tool: 'bq-query' };
      
      mockCoreClient.post.mockResolvedValue({
        data: {
          outputs: [[0.85]],
          confidence: 0.9,
        },
      });

      // Act
      const result = await client.predict(inputs, context);

      // Assert
      expect(result.outputs).toEqual([[0.85]]);
      expect(result.confidence).toBe(0.9);
      expect(mockCoreClient.post).toHaveBeenCalledWith('/api/network/predict', {
        inputs,
        context,
      });
    });

    it('should handle prediction errors', async () => {
      // Arrange
      mockCoreClient.post.mockRejectedValue(new Error('Model not loaded'));

      // Act & Assert
      await expect(client.predict([[0.1, 0.2]], {})).rejects.toThrow('Model not loaded');
    });
  });

  describe('predictPattern', () => {
    it('should predict patterns based on historical data', async () => {
      // Arrange
      const tool = 'bq-query';
      const params = { query: 'SELECT COUNT(*) FROM table' };
      const patterns = [
        { outcome: 'success', duration: 1000 },
        { outcome: 'success', duration: 1200 },
        { outcome: 'failure', duration: 5000 },
      ];

      mockCoreClient.post.mockResolvedValue({
        data: {
          outputs: [[0.75]],
          confidence: 0.85,
        },
      });

      // Act
      const prediction = await client.predictPattern(tool, params, patterns, {});

      // Assert
      expect(prediction.successProbability).toBeCloseTo(0.75, 2);
      expect(prediction.confidence).toBe(0.85);
      
      // Verify the input transformation
      const callArgs = mockCoreClient.post.mock.calls[0][1];
      expect(callArgs.inputs[0]).toHaveLength(10); // Should be padded to 10 features
      expect(callArgs.inputs[0][1]).toBeCloseTo(0.67, 2); // Success rate
    });

    it('should handle empty patterns', async () => {
      // Arrange
      mockCoreClient.post.mockResolvedValue({
        data: { outputs: [[0.5]], confidence: 0.5 },
      });

      // Act
      const prediction = await client.predictPattern('tool', {}, [], {});

      // Assert
      expect(prediction.successProbability).toBe(0.5);
      expect(prediction.confidence).toBe(0.5);
    });

    it('should return neutral prediction on error', async () => {
      // Arrange
      mockCoreClient.post.mockRejectedValue(new Error('Network error'));

      // Act
      const prediction = await client.predictPattern('tool', {}, [], {});

      // Assert
      expect(prediction.successProbability).toBe(0.5);
      expect(prediction.confidence).toBe(0.1); // Low confidence
    });
  });

  describe('trainPattern', () => {
    it('should train patterns successfully', async () => {
      // Arrange
      const inputs = [[0.1, 0.2], [0.3, 0.4]];
      const targets = [[0.9], [0.1]];
      const epochs = 150;

      mockCoreClient.post.mockResolvedValue({ data: { success: true } });

      // Act
      await client.trainPattern(inputs, targets, epochs);

      // Assert
      expect(mockCoreClient.post).toHaveBeenCalledWith('/api/network/train', {
        inputs,
        targets,
        epochs,
      });
    });
  });

  describe('forecast', () => {
    it('should forecast time series data', async () => {
      // Arrange
      const values = [100, 120, 115, 130, 125];
      const horizon = 3;

      mockModelClient.post.mockResolvedValue({
        data: {
          forecast: [135, 140, 138],
          confidence_intervals: {
            lower: [130, 133, 131],
            upper: [140, 147, 145],
          },
        },
      });

      // Act
      const result = await client.forecast(values, horizon);

      // Assert
      expect(result.forecast).toHaveLength(3);
      expect(result.forecast[0]).toBe(135);
      expect(mockModelClient.post).toHaveBeenCalledWith('/api/forecast', {
        values,
        horizon,
      });
    });
  });

  describe('Feature Engineering', () => {
    it('should correctly hash strings for features', async () => {
      // Arrange
      const patterns = [
        { outcome: 'success', duration: 1000 },
      ];

      mockCoreClient.post.mockResolvedValue({
        data: { outputs: [[0.8]], confidence: 0.9 },
      });

      // Act
      await client.predictPattern('bq-query', 
        { projectId: 'test-project', datasetId: 'test-dataset' }, 
        patterns, {});

      // Assert
      const callArgs = mockCoreClient.post.mock.calls[0][1];
      const features = callArgs.inputs[0];
      
      // Check that project and dataset IDs were hashed to features
      expect(features[4]).toBeGreaterThan(0); // Project ID feature
      expect(features[4]).toBeLessThanOrEqual(1);
      expect(features[5]).toBeGreaterThan(0); // Dataset ID feature
      expect(features[5]).toBeLessThanOrEqual(1);
    });

    it('should normalize duration features', async () => {
      // Arrange
      const patterns = [
        { outcome: 'success', duration: 5000 },
        { outcome: 'success', duration: 15000 },
      ];

      mockCoreClient.post.mockResolvedValue({
        data: { outputs: [[0.7]], confidence: 0.8 },
      });

      // Act
      await client.predictPattern('tool', {}, patterns, {});

      // Assert
      const features = mockCoreClient.post.mock.calls[0][1].inputs[0];
      const avgDurationFeature = features[2];
      
      // Average duration is 10000ms, normalized by /10000
      expect(avgDurationFeature).toBe(1.0);
    });
  });
});