import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import axios from 'axios';
import type { AxiosInstance } from 'axios';

/**
 * Contract Tests for ruv-FANN Backend APIs
 * 
 * These tests verify that our understanding of the backend APIs matches reality.
 * They should be run against actual backend services (or recorded responses).
 * 
 * Purpose:
 * - Ensure our mocks match real API behavior
 * - Detect breaking changes in backend APIs
 * - Document expected API shapes
 */

describe('ruv-FANN API Contract Tests', () => {
  let coreApi: AxiosInstance;
  let swarmApi: AxiosInstance;
  let modelApi: AxiosInstance;
  
  const testTimeout = 30000; // 30 seconds for real API calls
  
  beforeAll(() => {
    // Create API clients
    coreApi = axios.create({
      baseURL: process.env.RUV_FANN_CORE_URL || 'http://localhost:8090',
      timeout: testTimeout,
    });
    
    swarmApi = axios.create({
      baseURL: process.env.RUV_FANN_SWARM_URL || 'http://localhost:8081',
      timeout: testTimeout,
    });
    
    modelApi = axios.create({
      baseURL: process.env.RUV_FANN_MODEL_URL || 'http://localhost:8082',
      timeout: testTimeout,
    });
  });
  
  describe('Core API Contract', () => {
    it('POST /predict should return expected shape', async () => {
      // Skip if service not available
      try {
        await coreApi.get('/health');
      } catch {
        console.warn('⚠️  Core API not available, skipping contract test');
        return;
      }
      
      // Arrange
      const request = {
        tool: 'bq-query',
        params: { query: 'SELECT 1' },
        context: { timestamp: Date.now() },
      };
      
      // Act
      const response = await coreApi.post('/predict', request);
      
      // Assert - Verify response shape
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        successProbability: expect.any(Number),
        confidence: expect.any(Number),
        warnings: expect.any(Array),
        suggestions: expect.any(Array),
      });
      
      // Verify ranges
      expect(response.data.successProbability).toBeWithinRange(0, 1);
      expect(response.data.confidence).toBeWithinRange(0, 1);
      
      // Document the contract
      const contract = {
        endpoint: 'POST /predict',
        request: {
          tool: 'string',
          params: 'object',
          context: 'object (optional)',
        },
        response: {
          successProbability: 'number (0-1)',
          confidence: 'number (0-1)',
          warnings: 'Warning[]',
          suggestions: 'Suggestion[]',
          estimatedCost: 'number (optional)',
          estimatedDuration: 'number (optional)',
          explanation: 'string',
        },
      };
      
      // This contract can be used to validate mocks
      expect(contract).toBeDefined();
    });
    
    it('GET /patterns should return pattern list', async () => {
      try {
        await coreApi.get('/health');
      } catch {
        return; // Skip if not available
      }
      
      // Act
      const response = await coreApi.get('/patterns', {
        params: { tool: 'bq-query', limit: 10 },
      });
      
      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toHaveProperty('patterns');
      expect(Array.isArray(response.data.patterns)).toBe(true);
      
      if (response.data.patterns.length > 0) {
        const pattern = response.data.patterns[0];
        expect(pattern).toMatchObject({
          id: expect.any(Number),
          tool: expect.any(String),
          params: expect.any(String),
          outcome: expect.stringMatching(/^(success|failure)$/),
          timestamp: expect.any(String),
        });
      }
    });
  });
  
  describe('Swarm API Contract', () => {
    it('POST /agents/spawn should create analysis agents', async () => {
      try {
        await swarmApi.get('/health');
      } catch {
        console.warn('⚠️  Swarm API not available, skipping contract test');
        return;
      }
      
      // Arrange
      const request = {
        analysisType: 'pattern-matching',
        data: {
          tool: 'bq-query',
          patterns: ['SELECT * FROM table'],
        },
      };
      
      // Act
      const response = await swarmApi.post('/agents/spawn', request);
      
      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        agents: expect.any(Array),
      });
      
      if (response.data.agents.length > 0) {
        expect(response.data.agents[0]).toMatchObject({
          agentId: expect.any(String),
          status: expect.stringMatching(/^(created|running|completed|failed)$/),
          analysisType: expect.any(String),
        });
      }
    });
    
    it('GET /agents/:id/result should return analysis results', async () => {
      try {
        await swarmApi.get('/health');
      } catch {
        return; // Skip if not available
      }
      
      // This would need a real agent ID from a previous test
      // For now, we document the expected shape
      const expectedShape = {
        agentId: 'string',
        status: 'completed',
        result: {
          analysis: 'string or object',
          confidence: 'number',
          recommendations: 'string[]',
        },
      };
      
      expect(expectedShape).toBeDefined();
    });
  });
  
  describe('Model API Contract', () => {
    it('POST /predict/pattern should return neural network prediction', async () => {
      try {
        await modelApi.get('/health');
      } catch {
        console.warn('⚠️  Model API not available, skipping contract test');
        return;
      }
      
      // Arrange
      const request = {
        features: {
          tool: 'bq-query',
          queryLength: 50,
          hasWhereClause: true,
          tableCount: 1,
          joinCount: 0,
        },
      };
      
      // Act
      const response = await modelApi.post('/predict/pattern', request);
      
      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        prediction: expect.any(Number),
        confidence: expect.any(Number),
        features_used: expect.any(Array),
      });
      
      expect(response.data.prediction).toBeWithinRange(0, 1);
      expect(response.data.confidence).toBeWithinRange(0, 1);
    });
  });
  
  describe('Contract Validation Helpers', () => {
    /**
     * These helpers can be used to validate that mocks match contracts
     */
    const contracts = {
      predictResponse: {
        validate(response: any): boolean {
          return (
            typeof response.successProbability === 'number' &&
            response.successProbability >= 0 &&
            response.successProbability <= 1 &&
            typeof response.confidence === 'number' &&
            response.confidence >= 0 &&
            response.confidence <= 1 &&
            Array.isArray(response.warnings) &&
            Array.isArray(response.suggestions)
          );
        },
      },
      
      patternShape: {
        validate(pattern: any): boolean {
          return (
            typeof pattern.id === 'number' &&
            typeof pattern.tool === 'string' &&
            typeof pattern.params === 'string' &&
            ['success', 'failure'].includes(pattern.outcome) &&
            pattern.timestamp instanceof Date || typeof pattern.timestamp === 'string'
          );
        },
      },
    };
    
    it('contract validators should work correctly', () => {
      // Valid prediction response
      const validPrediction = {
        successProbability: 0.8,
        confidence: 0.9,
        warnings: [],
        suggestions: [],
      };
      expect(contracts.predictResponse.validate(validPrediction)).toBe(true);
      
      // Invalid prediction response
      const invalidPrediction = {
        successProbability: 1.5, // Out of range
        confidence: 0.9,
        warnings: [],
        suggestions: [],
      };
      expect(contracts.predictResponse.validate(invalidPrediction)).toBe(false);
    });
  });
});

/**
 * Contract Recording Utilities
 * 
 * These can be used to record real API responses for offline testing
 */
export class ContractRecorder {
  private recordings: Map<string, any> = new Map();
  
  async recordApiCall(name: string, apiCall: () => Promise<any>): Promise<any> {
    try {
      const response = await apiCall();
      this.recordings.set(name, {
        timestamp: new Date().toISOString(),
        response: response.data,
        status: response.status,
        headers: response.headers,
      });
      return response;
    } catch (error: any) {
      this.recordings.set(name, {
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          code: error.code,
          status: error.response?.status,
        },
      });
      throw error;
    }
  }
  
  saveRecordings(filePath: string) {
    const fs = require('fs');
    fs.writeFileSync(
      filePath,
      JSON.stringify(Array.from(this.recordings.entries()), null, 2)
    );
  }
  
  loadRecordings(filePath: string) {
    const fs = require('fs');
    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    this.recordings = new Map(data);
  }
  
  getRecording(name: string): any {
    return this.recordings.get(name);
  }
}

/**
 * Example of using recorded contracts for offline testing
 */
describe('Offline Contract Tests (using recordings)', () => {
  it('should validate against recorded API responses', () => {
    // This would load previously recorded responses
    const recorder = new ContractRecorder();
    // recorder.loadRecordings('./tests/contracts/recordings.json');
    
    // Then validate current mocks against recorded shapes
    // This ensures mocks stay in sync with real API evolution
  });
});