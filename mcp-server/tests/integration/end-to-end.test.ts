import { jest } from '@jest/globals';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { 
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { GCPMCPClient } from '../../src/clients/gcp-mcp-client.js';
import { RuvFannClient } from '../../src/clients/ruv-fann-client.js';
import { TestHelpers } from '../utils/test-helpers.js';
import { MockFactory } from '../utils/mock-factory.js';
import axios from 'axios';

// Mock external dependencies
jest.mock('axios');
jest.mock('@modelcontextprotocol/sdk/server/stdio.js');

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('End-to-End Integration Tests', () => {
  let server: Server;
  let mockTransport: any;
  let mockGCPBackend: any;
  let mockRuvFannBackend: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Create mock transport
    mockTransport = {
      start: jest.fn(),
      send: jest.fn(),
      close: jest.fn(),
    };

    // Mock StdioServerTransport
    (StdioServerTransport as jest.MockedClass<typeof StdioServerTransport>)
      .mockImplementation(() => mockTransport);

    // Create mock HTTP clients
    mockGCPBackend = {
      post: jest.fn(),
      get: jest.fn(),
    };

    mockRuvFannBackend = {
      post: jest.fn(),
      get: jest.fn(),
    };

    // Configure axios mocks
    mockedAxios.create.mockImplementation((config) => {
      if (config?.baseURL?.includes('8080')) return mockGCPBackend;
      if (config?.baseURL?.includes('809')) return mockRuvFannBackend;
      return mockGCPBackend;
    });

    // Set up default successful responses
    mockGCPBackend.post.mockResolvedValue({
      data: {
        jsonrpc: '2.0',
        id: 1,
        result: {
          content: [{ type: 'text', text: 'GCP operation successful' }],
        },
      },
    });

    mockRuvFannBackend.get.mockResolvedValue({ status: 200 });
    mockRuvFannBackend.post.mockResolvedValue({
      data: {
        outputs: [[0.8]],
        confidence: 0.9,
      },
    });
  });

  describe('Tool Discovery', () => {
    it('should list all available tools including GCP tools', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      // Mock the server's request handler
      let toolsHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === ListToolsRequestSchema) {
            toolsHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      // Replace server with mock
      (serverInstance as any).server = mockServer;
      serverInstance.setupHandlers();

      // Act
      const response = await toolsHandler({});

      // Assert
      expect(response.tools).toBeDefined();
      expect(response.tools.length).toBeGreaterThan(0);
      
      // Should have ruv-FANN tools
      const ruvFannTools = response.tools.filter((t: any) => 
        ['predict_outcome', 'learn_pattern', 'get_suggestions'].includes(t.name)
      );
      expect(ruvFannTools).toHaveLength(3);
      
      // Should have GCP tools
      const gcpTools = response.tools.filter((t: any) => 
        t.name.startsWith('bq-') || t.name === 'gcp-sql'
      );
      expect(gcpTools.length).toBeGreaterThan(0);
    });
  });

  describe('GCP Tool Execution with Intelligence', () => {
    it('should execute GCP tool with prediction and warnings', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      let callToolHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === CallToolRequestSchema) {
            callToolHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      (serverInstance as any).server = mockServer;
      
      // Initialize components
      await serverInstance.setupHandlers();

      // Mock pattern storage to return high-failure patterns
      const mockPatternStorage = (serverInstance as any).gcpPatternStorage;
      jest.spyOn(mockPatternStorage, 'getSimilarCommands').mockResolvedValue(
        Array(10).fill(null).map(() => MockFactory.createCommandPattern({
          outcome: 'failure',
          error: 'Table scan timeout',
        }))
      );

      // Act
      const request = {
        params: {
          name: 'bq-query',
          arguments: {
            query: 'SELECT * FROM huge_table',
            projectId: 'test-project',
          },
        },
      };

      const response = await callToolHandler(request);

      // Assert
      expect(response.content).toBeDefined();
      expect(response.content[0].text).toContain('Intelligence');
      
      // Should have made prediction call
      expect(mockRuvFannBackend.post).toHaveBeenCalled();
    });

    it('should block high-risk operations', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      // Set up very low success probability
      mockRuvFannBackend.post.mockResolvedValue({
        data: {
          outputs: [[0.1]], // 10% success probability
          confidence: 0.95, // High confidence in failure
        },
      });

      let callToolHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === CallToolRequestSchema) {
            callToolHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      (serverInstance as any).server = mockServer;
      await serverInstance.setupHandlers();

      // Act
      const response = await callToolHandler({
        params: {
          name: 'bq-query',
          arguments: {
            query: 'DELETE FROM production_table',
          },
        },
      });

      // Assert
      expect(response.content[0].text).toContain('blocked');
      expect(response.content[0].text).toContain('high failure risk');
      
      // Should NOT have called GCP backend
      expect(mockGCPBackend.post).not.toHaveBeenCalled();
    });

    it('should enhance successful responses with insights', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      // Mock successful GCP response
      mockGCPBackend.post.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          id: 1,
          result: {
            content: [{
              type: 'text',
              text: 'Query returned 100 rows',
            }],
          },
        },
      });

      let callToolHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === CallToolRequestSchema) {
            callToolHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      (serverInstance as any).server = mockServer;
      await serverInstance.setupHandlers();

      // Act
      const response = await callToolHandler({
        params: {
          name: 'bq-query',
          arguments: {
            query: 'SELECT COUNT(*) FROM small_table',
          },
        },
      });

      // Assert
      expect(response.content[0].text).toContain('Query returned 100 rows');
      
      // Should have called both prediction and GCP backend
      expect(mockRuvFannBackend.post).toHaveBeenCalled();
      expect(mockGCPBackend.post).toHaveBeenCalled();
    });
  });

  describe('Learning from Operations', () => {
    it('should record successful operations for learning', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      let callToolHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === CallToolRequestSchema) {
            callToolHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      (serverInstance as any).server = mockServer;
      await serverInstance.setupHandlers();

      // Spy on pattern recording
      const recordSpy = jest.spyOn(
        (serverInstance as any).gcpPatternStorage, 
        'recordCommandPattern'
      );

      // Act
      await callToolHandler({
        params: {
          name: 'bq-list-datasets',
          arguments: { projectId: 'test-project' },
        },
      });

      // Assert
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'bq-list-datasets',
          outcome: 'success',
        })
      );
    });

    it('should record failed operations with error details', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      // Mock GCP error response
      mockGCPBackend.post.mockResolvedValue({
        data: {
          jsonrpc: '2.0',
          id: 1,
          error: {
            code: 'PERMISSION_DENIED',
            message: 'User does not have access to dataset',
          },
        },
      });

      let callToolHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === CallToolRequestSchema) {
            callToolHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      (serverInstance as any).server = mockServer;
      await serverInstance.setupHandlers();

      const recordSpy = jest.spyOn(
        (serverInstance as any).gcpPatternStorage, 
        'recordCommandPattern'
      );

      // Act
      await callToolHandler({
        params: {
          name: 'bq-list-tables',
          arguments: { datasetId: 'restricted_dataset' },
        },
      });

      // Assert
      expect(recordSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          tool: 'bq-list-tables',
          outcome: 'failure',
          error: 'User does not have access to dataset',
        })
      );
    });
  });

  describe('Performance and Concurrency', () => {
    it('should handle concurrent tool calls efficiently', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      let callToolHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === CallToolRequestSchema) {
            callToolHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      (serverInstance as any).server = mockServer;
      await serverInstance.setupHandlers();

      // Act - Make multiple concurrent calls
      const startTime = Date.now();
      const promises = Array(10).fill(null).map((_, i) => 
        callToolHandler({
          params: {
            name: 'bq-query',
            arguments: {
              query: `SELECT ${i} FROM table`,
            },
          },
        })
      );

      const results = await Promise.all(promises);
      const duration = Date.now() - startTime;

      // Assert
      expect(results).toHaveLength(10);
      expect(results.every(r => r.content)).toBe(true);
      
      // Should complete reasonably fast (not sequential)
      expect(duration).toBeLessThan(2000); // Less than 2 seconds for 10 calls
    });
  });

  describe('Error Recovery', () => {
    it('should handle backend connection failures gracefully', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      // Mock connection failure
      mockGCPBackend.post.mockRejectedValue(new Error('Connection refused'));

      let callToolHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === CallToolRequestSchema) {
            callToolHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      (serverInstance as any).server = mockServer;
      await serverInstance.setupHandlers();

      // Act
      const response = await callToolHandler({
        params: {
          name: 'bq-query',
          arguments: { query: 'SELECT 1' },
        },
      });

      // Assert
      expect(response.content[0].text).toContain('Failed');
      expect(response.content[0].text).toContain('Connection refused');
      expect(response.content[0].text).toContain('recorded for future intelligence');
    });

    it('should continue working if pattern storage fails', async () => {
      // Arrange
      const { RuvFannMCPServer } = await import('../../src/index.js');
      const serverInstance = new RuvFannMCPServer();
      
      // Mock pattern storage failure
      jest.spyOn(
        (serverInstance as any).gcpPatternStorage,
        'recordCommandPattern'
      ).mockRejectedValue(new Error('Database locked'));

      let callToolHandler: any;
      const mockServer = {
        setRequestHandler: jest.fn((schema, handler) => {
          if (schema === CallToolRequestSchema) {
            callToolHandler = handler;
          }
        }),
        connect: jest.fn(),
      };

      (serverInstance as any).server = mockServer;
      await serverInstance.setupHandlers();

      // Act
      const response = await callToolHandler({
        params: {
          name: 'bq-list-datasets',
          arguments: { projectId: 'test' },
        },
      });

      // Assert
      expect(response.content).toBeDefined();
      expect(response.content[0].text).toContain('successful');
      // Should complete despite storage failure
    });
  });
});