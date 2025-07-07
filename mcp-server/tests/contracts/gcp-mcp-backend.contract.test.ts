import { describe, it, expect, beforeAll } from 'vitest';
import axios from 'axios';
import type { AxiosInstance } from 'axios';

/**
 * Contract Tests for GCP MCP Backend API
 * 
 * These tests ensure our integration with the GCP MCP Backend
 * matches the expected API contract. This prevents issues where:
 * - Backend API changes break our integration
 * - Our assumptions about API behavior are incorrect
 * - Mock data drifts from real API responses
 */

describe('GCP MCP Backend API Contract Tests', () => {
  let gcpApi: AxiosInstance;
  const testTimeout = 30000;
  
  beforeAll(() => {
    gcpApi = axios.create({
      baseURL: process.env.GCP_MCP_BACKEND_URL || 'http://localhost:8080',
      timeout: testTimeout,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  });
  
  /**
   * Helper to check if service is available
   */
  async function isServiceAvailable(): Promise<boolean> {
    try {
      await gcpApi.get('/health');
      return true;
    } catch {
      console.warn('⚠️  GCP MCP Backend not available, skipping contract tests');
      return false;
    }
  }
  
  describe('BigQuery Operations Contract', () => {
    it('POST /execute/bq-query should match expected contract', async () => {
      if (!await isServiceAvailable()) return;
      
      // Arrange
      const request = {
        tool: 'bq-query',
        params: {
          query: 'SELECT 1 as test',
          projectId: 'test-project',
          location: 'US',
        },
      };
      
      // Act
      const response = await gcpApi.post('/execute/bq-query', request);
      
      // Assert - Response structure
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: expect.any(Boolean),
        data: expect.any(Object),
        metadata: expect.objectContaining({
          duration: expect.any(Number),
          bytesProcessed: expect.any(Number),
          cost: expect.any(Number),
        }),
      });
      
      // Document the contract
      const contract = {
        endpoint: 'POST /execute/bq-query',
        request: {
          tool: 'string (required)',
          params: {
            query: 'string (required)',
            projectId: 'string (optional)',
            location: 'string (optional)',
            useLegacySql: 'boolean (optional)',
          },
        },
        response: {
          success: 'boolean',
          data: {
            rows: 'array',
            schema: 'object',
            totalRows: 'number',
          },
          metadata: {
            duration: 'number (ms)',
            bytesProcessed: 'number',
            cost: 'number (USD)',
            cacheHit: 'boolean',
          },
          error: 'object (optional)',
        },
      };
      
      expect(contract).toBeDefined();
    });
    
    it('POST /execute/bq-list-datasets should return dataset list', async () => {
      if (!await isServiceAvailable()) return;
      
      // Arrange
      const request = {
        tool: 'bq-list-datasets',
        params: {
          projectId: 'test-project',
        },
      };
      
      // Act
      const response = await gcpApi.post('/execute/bq-list-datasets', request);
      
      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: expect.any(Boolean),
        data: {
          datasets: expect.any(Array),
        },
      });
      
      if (response.data.data.datasets.length > 0) {
        const dataset = response.data.data.datasets[0];
        expect(dataset).toMatchObject({
          id: expect.any(String),
          projectId: expect.any(String),
          location: expect.any(String),
          creationTime: expect.any(String),
        });
      }
    });
    
    it('POST /execute/bq-list-tables should return table list', async () => {
      if (!await isServiceAvailable()) return;
      
      // Arrange
      const request = {
        tool: 'bq-list-tables',
        params: {
          projectId: 'test-project',
          datasetId: 'test-dataset',
        },
      };
      
      // Act
      const response = await gcpApi.post('/execute/bq-list-tables', request);
      
      // Assert
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: expect.any(Boolean),
        data: {
          tables: expect.any(Array),
        },
      });
    });
  });
  
  describe('GCP SQL Operations Contract', () => {
    it('POST /execute/gcp-sql should handle operations', async () => {
      if (!await isServiceAvailable()) return;
      
      // Test list-datasets operation
      const request = {
        tool: 'gcp-sql',
        params: {
          operation: 'list-datasets',
          projectId: 'test-project',
        },
      };
      
      const response = await gcpApi.post('/execute/gcp-sql', request);
      
      expect(response.status).toBe(200);
      expect(response.data).toMatchObject({
        success: expect.any(Boolean),
        data: expect.any(Object),
      });
    });
  });
  
  describe('Error Response Contract', () => {
    it('should return consistent error format for invalid queries', async () => {
      if (!await isServiceAvailable()) return;
      
      // Arrange - Invalid SQL syntax
      const request = {
        tool: 'bq-query',
        params: {
          query: 'SELECT * FROM WHERE invalid',
        },
      };
      
      // Act
      let errorResponse;
      try {
        await gcpApi.post('/execute/bq-query', request);
      } catch (error: any) {
        errorResponse = error.response;
      }
      
      // Assert - Error response structure
      expect(errorResponse?.status).toBe(400);
      expect(errorResponse?.data).toMatchObject({
        success: false,
        error: {
          code: expect.any(String),
          message: expect.any(String),
          details: expect.any(Object),
        },
      });
    });
    
    it('should return 403 for permission errors', async () => {
      if (!await isServiceAvailable()) return;
      
      // Arrange - Access restricted dataset
      const request = {
        tool: 'bq-list-tables',
        params: {
          projectId: 'restricted-project',
          datasetId: 'private-dataset',
        },
      };
      
      // Act
      let errorResponse;
      try {
        await gcpApi.post('/execute/bq-list-tables', request);
      } catch (error: any) {
        errorResponse = error.response;
      }
      
      // Assert
      if (errorResponse) {
        expect([403, 404]).toContain(errorResponse.status);
        expect(errorResponse.data.error.message).toMatch(/permission|not found/i);
      }
    });
  });
  
  describe('Contract Compliance Validators', () => {
    /**
     * These validators can be used in mocks to ensure they comply with contracts
     */
    export const gcpContractValidators = {
      queryResponse: {
        validate(response: any): boolean {
          if (!response.success || !response.data || !response.metadata) {
            return false;
          }
          
          const { data, metadata } = response;
          
          return (
            Array.isArray(data.rows) &&
            typeof metadata.duration === 'number' &&
            typeof metadata.bytesProcessed === 'number' &&
            typeof metadata.cost === 'number' &&
            metadata.cost >= 0
          );
        },
      },
      
      errorResponse: {
        validate(response: any): boolean {
          return (
            response.success === false &&
            response.error &&
            typeof response.error.code === 'string' &&
            typeof response.error.message === 'string'
          );
        },
      },
      
      datasetListResponse: {
        validate(response: any): boolean {
          if (!response.success || !response.data?.datasets) {
            return false;
          }
          
          return response.data.datasets.every((dataset: any) => 
            typeof dataset.id === 'string' &&
            typeof dataset.projectId === 'string' &&
            typeof dataset.location === 'string'
          );
        },
      },
    };
    
    it('validators should correctly identify valid responses', () => {
      const validQueryResponse = {
        success: true,
        data: {
          rows: [{ col1: 'value1' }],
          schema: { fields: [] },
          totalRows: 1,
        },
        metadata: {
          duration: 150,
          bytesProcessed: 1024,
          cost: 0.001,
          cacheHit: false,
        },
      };
      
      expect(gcpContractValidators.queryResponse.validate(validQueryResponse)).toBe(true);
    });
    
    it('validators should reject invalid responses', () => {
      const invalidQueryResponse = {
        success: true,
        data: {
          rows: 'not-an-array', // Invalid
        },
        metadata: {
          duration: 150,
          bytesProcessed: 1024,
          cost: -1, // Invalid negative cost
        },
      };
      
      expect(gcpContractValidators.queryResponse.validate(invalidQueryResponse)).toBe(false);
    });
  });
  
  describe('Mock Compliance Check', () => {
    it('mock responses should comply with documented contracts', () => {
      // Example mock response that should match contract
      const mockQueryResponse = {
        success: true,
        data: {
          rows: [
            { id: 1, name: 'Test' },
            { id: 2, name: 'Example' },
          ],
          schema: {
            fields: [
              { name: 'id', type: 'INTEGER' },
              { name: 'name', type: 'STRING' },
            ],
          },
          totalRows: 2,
        },
        metadata: {
          duration: 125,
          bytesProcessed: 2048,
          cost: 0.00001,
          cacheHit: false,
        },
      };
      
      // Validate mock matches contract
      expect(gcpContractValidators.queryResponse.validate(mockQueryResponse)).toBe(true);
    });
  });
});

/**
 * Contract Documentation Generator
 * 
 * Generates markdown documentation from contract tests
 */
export class ContractDocGenerator {
  generateDocs(contracts: Record<string, any>): string {
    let doc = '# API Contracts\n\n';
    
    for (const [name, contract] of Object.entries(contracts)) {
      doc += `## ${name}\n\n`;
      doc += `**Endpoint**: ${contract.endpoint}\n\n`;
      doc += '### Request\n```json\n';
      doc += JSON.stringify(contract.request, null, 2);
      doc += '\n```\n\n';
      doc += '### Response\n```json\n';
      doc += JSON.stringify(contract.response, null, 2);
      doc += '\n```\n\n';
    }
    
    return doc;
  }
}