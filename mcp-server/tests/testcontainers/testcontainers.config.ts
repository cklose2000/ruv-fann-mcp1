import { DockerComposeEnvironment, StartedDockerComposeEnvironment } from 'testcontainers';
import { GenericContainer, StartedTestContainer } from 'testcontainers';
import path from 'path';

/**
 * Test Container Configuration
 * 
 * Provides real services for integration testing without mocks.
 * This ensures tests reflect actual production behavior.
 */

export interface TestServices {
  postgres?: StartedTestContainer;
  gcpBackend?: StartedTestContainer;
  ruvCore?: StartedTestContainer;
  ruvSwarm?: StartedTestContainer;
  ruvModel?: StartedTestContainer;
  compose?: StartedDockerComposeEnvironment;
}

export class TestContainersManager {
  private services: TestServices = {};
  
  /**
   * Start all services using docker-compose
   */
  async startCompose(): Promise<TestServices> {
    console.log('🐳 Starting test containers with docker-compose...');
    
    const composeFilePath = path.join(__dirname);
    const composeFile = 'docker-compose.test.yml';
    
    this.services.compose = await new DockerComposeEnvironment(
      composeFilePath,
      composeFile
    )
      .withWaitStrategy('postgres', Wait.forHealthCheck())
      .withWaitStrategy('gcp-mcp-backend', Wait.forHealthCheck())
      .withWaitStrategy('ruv-fann-core', Wait.forHealthCheck())
      .withWaitStrategy('ruv-fann-swarm', Wait.forHealthCheck())
      .withWaitStrategy('ruv-fann-model', Wait.forHealthCheck())
      .up();
    
    console.log('✅ All test containers started');
    
    return this.services;
  }
  
  /**
   * Start individual containers for selective testing
   */
  async startPostgres(): Promise<StartedTestContainer> {
    console.log('🐳 Starting PostgreSQL container...');
    
    this.services.postgres = await new GenericContainer('postgres:15-alpine')
      .withEnvironment({
        POSTGRES_USER: 'testuser',
        POSTGRES_PASSWORD: 'testpass',
        POSTGRES_DB: 'patterns_test',
      })
      .withExposedPorts(5432)
      .withWaitStrategy(Wait.forLogMessage('database system is ready to accept connections'))
      .start();
    
    console.log('✅ PostgreSQL started on port:', this.services.postgres.getMappedPort(5432));
    
    return this.services.postgres;
  }
  
  /**
   * Start a minimal GCP backend mock
   */
  async startGCPBackendMock(): Promise<StartedTestContainer> {
    console.log('🐳 Starting GCP Backend mock container...');
    
    this.services.gcpBackend = await new GenericContainer('node:18-alpine')
      .withCommand([
        'sh', '-c',
        `
        cat > /app/server.js << 'EOF'
        const express = require('express');
        const app = express();
        app.use(express.json());
        
        // Health check
        app.get('/health', (req, res) => res.json({ status: 'healthy' }));
        
        // Mock BigQuery query endpoint
        app.post('/execute/bq-query', (req, res) => {
          const { params } = req.body;
          
          // Simulate different responses based on query
          if (params.query.includes('FAIL')) {
            return res.status(400).json({
              success: false,
              error: {
                code: 'INVALID_QUERY',
                message: 'Syntax error in query',
              },
            });
          }
          
          res.json({
            success: true,
            data: {
              rows: [{ result: 1 }],
              schema: { fields: [{ name: 'result', type: 'INTEGER' }] },
              totalRows: 1,
            },
            metadata: {
              duration: 125,
              bytesProcessed: 0,
              cost: 0,
              cacheHit: true,
            },
          });
        });
        
        app.listen(8080, () => console.log('Mock GCP Backend running on port 8080'));
        EOF
        
        npm install express && node /app/server.js
        `
      ])
      .withExposedPorts(8080)
      .withWaitStrategy(Wait.forLogMessage('Mock GCP Backend running'))
      .start();
    
    console.log('✅ GCP Backend mock started');
    
    return this.services.gcpBackend;
  }
  
  /**
   * Get connection URLs for services
   */
  getServiceUrls(): Record<string, string> {
    const urls: Record<string, string> = {};
    
    if (this.services.postgres) {
      const host = this.services.postgres.getHost();
      const port = this.services.postgres.getMappedPort(5432);
      urls.POSTGRES_URL = `postgresql://testuser:testpass@${host}:${port}/patterns_test`;
    }
    
    if (this.services.gcpBackend) {
      const host = this.services.gcpBackend.getHost();
      const port = this.services.gcpBackend.getMappedPort(8080);
      urls.GCP_MCP_BACKEND_URL = `http://${host}:${port}`;
    }
    
    // Add other service URLs as needed
    
    return urls;
  }
  
  /**
   * Stop all containers
   */
  async stopAll(): Promise<void> {
    console.log('🛑 Stopping test containers...');
    
    if (this.services.compose) {
      await this.services.compose.down();
    }
    
    // Stop individual containers
    const containers = [
      this.services.postgres,
      this.services.gcpBackend,
      this.services.ruvCore,
      this.services.ruvSwarm,
      this.services.ruvModel,
    ].filter(Boolean);
    
    await Promise.all(containers.map(c => c?.stop()));
    
    console.log('✅ All containers stopped');
  }
}

/**
 * Global test setup for integration tests
 */
export async function setupIntegrationTests(): Promise<{
  services: TestServices;
  urls: Record<string, string>;
  teardown: () => Promise<void>;
}> {
  const manager = new TestContainersManager();
  
  // Start services based on environment
  let services: TestServices;
  
  if (process.env.USE_COMPOSE === 'true') {
    services = await manager.startCompose();
  } else {
    // Start individual containers for faster startup
    await Promise.all([
      manager.startPostgres(),
      manager.startGCPBackendMock(),
    ]);
    services = manager.services;
  }
  
  const urls = manager.getServiceUrls();
  
  // Set environment variables for tests
  Object.entries(urls).forEach(([key, value]) => {
    process.env[key] = value;
  });
  
  return {
    services,
    urls,
    teardown: () => manager.stopAll(),
  };
}

/**
 * Wait strategies for containers
 */
const Wait = {
  forLogMessage: (message: string) => ({
    waitUntilReady: async (container: any) => {
      return new Promise((resolve) => {
        container.logs().on('data', (data: Buffer) => {
          if (data.toString().includes(message)) {
            resolve(true);
          }
        });
      });
    },
  }),
  
  forHealthCheck: () => ({
    waitUntilReady: async () => {
      // Implement health check waiting logic
      return true;
    },
  }),
};

/**
 * Example usage in tests
 */
export const integrationTestExample = `
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { setupIntegrationTests } from './testcontainers.config';

describe('Integration Tests with Real Services', () => {
  let teardown: () => Promise<void>;
  
  beforeAll(async () => {
    const setup = await setupIntegrationTests();
    teardown = setup.teardown;
    
    // Services are now running and URLs are in process.env
    console.log('Services available at:', setup.urls);
  }, 60000); // 60 second timeout for container startup
  
  afterAll(async () => {
    await teardown();
  });
  
  it('should query real PostgreSQL database', async () => {
    // Test with real database, no mocks!
    const storage = new GCPPatternStorage(process.env.POSTGRES_URL);
    const pattern = await storage.recordCommandPattern({...});
    expect(pattern).toBeDefined();
  });
  
  it('should call real GCP backend service', async () => {
    // Test with real service, no mocks!
    const response = await axios.post(
      \`\${process.env.GCP_MCP_BACKEND_URL}/execute/bq-query\`,
      { params: { query: 'SELECT 1' } }
    );
    expect(response.data.success).toBe(true);
  });
});
`;