# Test Containers Setup

This directory contains configuration for running real services during integration tests, avoiding the pitfalls of mocking.

## Why Test Containers?

1. **Real Behavior**: Tests run against actual services, not mocks
2. **No Hallucinations**: Eliminates false positives from incorrect mocks
3. **Contract Validation**: Real services ensure API contracts are correct
4. **Database Testing**: Use real PostgreSQL instead of in-memory databases
5. **Service Integration**: Test actual HTTP calls and responses

## Quick Start

### Using Docker Compose (Recommended)

```bash
# Start all test services
docker-compose -f tests/testcontainers/docker-compose.test.yml up -d

# Run integration tests
npm run test:integration

# Stop services
docker-compose -f tests/testcontainers/docker-compose.test.yml down
```

### Using Testcontainers Library

```bash
# Install testcontainers
npm install -D testcontainers

# Run tests (containers start automatically)
npm run test:integration
```

## Services Provided

### 1. PostgreSQL Database
- **Purpose**: Real database for pattern storage testing
- **Port**: 5432
- **Credentials**: testuser/testpass
- **Database**: patterns_test
- **Features**: 
  - Pre-initialized schema matching production
  - Test data seeded automatically
  - Full SQL support (unlike SQLite)

### 2. GCP MCP Backend Mock
- **Purpose**: Realistic GCP API responses
- **Port**: 8080
- **Endpoints**:
  - `/execute/bq-query` - BigQuery execution
  - `/execute/bq-list-datasets` - Dataset listing
  - `/execute/bq-list-tables` - Table listing
  - `/execute/gcp-sql` - SQL operations
- **Features**:
  - Simulates real error conditions
  - Returns properly formatted responses
  - Validates request structure

### 3. ruv-FANN Services (Optional)
- **Core Service**: Port 8090
- **Swarm Service**: Port 8081
- **Model Service**: Port 8082
- **Features**:
  - Can use real services or lightweight mocks
  - Health check endpoints
  - Configurable response delays

## Writing Integration Tests

### Example Test with Real Database

```typescript
import { describe, beforeAll, afterAll, it, expect } from 'vitest';
import { setupIntegrationTests } from '../testcontainers/testcontainers.config';
import { GCPPatternStorage } from '../../src/storage/gcp-pattern-storage';

describe('Pattern Storage Integration', () => {
  let teardown: () => Promise<void>;
  let storage: GCPPatternStorage;
  
  beforeAll(async () => {
    // Start real PostgreSQL container
    const setup = await setupIntegrationTests();
    teardown = setup.teardown;
    
    // Connect to real database
    storage = new GCPPatternStorage(process.env.POSTGRES_URL!);
  }, 60000);
  
  afterAll(async () => {
    await teardown();
  });
  
  it('should store patterns in real database', async () => {
    // This runs against real PostgreSQL, not SQLite!
    const id = await storage.recordCommandPattern({
      tool: 'bq-query',
      params: JSON.stringify({ query: 'SELECT 1' }),
      outcome: 'success',
      duration: 150,
    });
    
    expect(id).toBeGreaterThan(0);
    
    // Verify in real database
    const patterns = await storage.getSimilarCommands('bq-query', {}, 10);
    expect(patterns).toContainEqual(
      expect.objectContaining({ id })
    );
  });
});
```

### Example Test with Real Service

```typescript
describe('GCP Backend Integration', () => {
  it('should handle real API responses', async () => {
    // This calls the actual mock service, not a Jest mock!
    const response = await axios.post(
      `${process.env.GCP_MCP_BACKEND_URL}/execute/bq-query`,
      {
        tool: 'bq-query',
        params: { query: 'SELECT * FROM dataset.table' },
      }
    );
    
    expect(response.data).toMatchObject({
      success: true,
      data: expect.any(Object),
      metadata: expect.objectContaining({
        duration: expect.any(Number),
        cost: expect.any(Number),
      }),
    });
  });
  
  it('should handle real error responses', async () => {
    try {
      await axios.post(
        `${process.env.GCP_MCP_BACKEND_URL}/execute/bq-query`,
        {
          tool: 'bq-query',
          params: { query: 'SYNTAX_ERROR' },
        }
      );
    } catch (error: any) {
      // Real error response from service
      expect(error.response.status).toBe(400);
      expect(error.response.data.error.code).toBe('INVALID_ARGUMENT');
    }
  });
});
```

## Configuration Options

### Environment Variables

```bash
# Use docker-compose instead of individual containers
USE_COMPOSE=true

# Custom service URLs (if not using containers)
POSTGRES_URL=postgresql://user:pass@localhost:5432/db
GCP_MCP_BACKEND_URL=http://localhost:8080

# Test configuration
TEST_TIMEOUT=60000
CONTAINER_STARTUP_TIMEOUT=30000
```

### Selective Service Starting

```typescript
// Start only what you need for faster tests
const manager = new TestContainersManager();

// Just PostgreSQL
await manager.startPostgres();

// Just GCP Backend
await manager.startGCPBackendMock();

// Or use compose for everything
await manager.startCompose();
```

## Best Practices

1. **Clean State**: Containers start fresh for each test run
2. **Parallel Tests**: Each test can use isolated databases/schemas
3. **Real Timeouts**: Test actual timeout behavior
4. **Error Conditions**: Test real error responses
5. **Performance**: Measure actual query performance

## Troubleshooting

### Containers Won't Start

```bash
# Check if ports are in use
lsof -i :5432
lsof -i :8080

# Check Docker daemon
docker ps
docker-compose logs
```

### Tests Timeout

```typescript
// Increase timeout for container startup
beforeAll(async () => {
  // ...
}, 120000); // 2 minutes
```

### Database Connection Issues

```bash
# Test connection manually
psql -h localhost -U testuser -d patterns_test

# Check container logs
docker logs <container-id>
```

## CI/CD Integration

### GitHub Actions

```yaml
services:
  postgres:
    image: postgres:15
    env:
      POSTGRES_USER: testuser
      POSTGRES_PASSWORD: testpass
      POSTGRES_DB: patterns_test
    options: >-
      --health-cmd pg_isready
      --health-interval 10s
      --health-timeout 5s
      --health-retries 5
```

### GitLab CI

```yaml
services:
  - postgres:15
  
variables:
  POSTGRES_USER: testuser
  POSTGRES_PASSWORD: testpass
  POSTGRES_DB: patterns_test
```

## Performance Considerations

- Containers add ~5-10s startup time
- Use `--runInBand` for Jest to avoid port conflicts
- Consider keeping containers running during development
- Use container health checks to ensure readiness

## Summary

Test containers provide confidence that our tests reflect real-world behavior. While they add complexity and time to test runs, they eliminate entire classes of bugs that mocked tests miss. This aligns with our philosophy: **better to have slower, reliable tests than fast tests that lie**.