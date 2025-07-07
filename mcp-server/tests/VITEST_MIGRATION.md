# Migrating to Vitest for Better ESM Support

## Why Vitest?

Vitest offers several advantages over Jest for our ESM-based codebase:

1. **Native ESM Support**: No need for experimental flags or transforms
2. **Fast**: Leverages Vite's transformation pipeline
3. **Jest Compatible**: Most Jest APIs work out of the box
4. **Better Mocking**: ESM mocking that actually works
5. **TypeScript First**: Built with TypeScript in mind

## Migration Steps

### 1. Install Vitest

```bash
npm install -D vitest @vitest/coverage-v8 @vitest/ui
```

### 2. Update package.json Scripts

```json
{
  "scripts": {
    "test": "vitest",
    "test:unit": "vitest run tests/unit",
    "test:integration": "vitest run tests/integration",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui"
  }
}
```

### 3. Convert Test Files

Most Jest tests work with minimal changes:

#### Before (Jest with ESM issues):
```typescript
// gcp-predictor.test.ts
import { jest } from '@jest/globals';

// These mocks don't work properly with ESM
jest.mock('../../../src/clients/ruv-fann-client.js');
jest.mock('../../../src/storage/gcp-pattern-storage.js');

describe.skip('GCPPredictor', () => {  // Skipped due to ESM issues
  // ...
});
```

#### After (Vitest with working ESM):
```typescript
// gcp-predictor.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GCPPredictor } from '../../../src/predictors/gcp-predictor.js';

// Vitest mocking that works with ESM
vi.mock('../../../src/clients/ruv-fann-client.js', () => ({
  RuvFannClient: vi.fn().mockImplementation(() => ({
    predictPattern: vi.fn(),
    spawnPatternAnalysisAgents: vi.fn(),
  })),
}));

describe('GCPPredictor', () => {  // No longer skipped!
  let predictor: GCPPredictor;
  
  beforeEach(() => {
    vi.clearAllMocks();
    // Setup test instance
  });
  
  it('should predict success for valid queries', async () => {
    // Test implementation
  });
});
```

### 4. Setup File for Vitest

Create `tests/setup/vitest-setup.ts`:

```typescript
import { beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Global test setup
beforeAll(() => {
  // Ensure test directories exist
  const testDirs = [
    'tests/fixtures',
    'tests/fixtures/integration',
    'tests/reports',
  ];
  
  testDirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
});

// Cleanup after each test
afterEach(() => {
  // Clean up test databases
  const testDbPattern = /test.*\.db$/;
  const fixturesDir = path.join(process.cwd(), 'tests/fixtures');
  
  if (fs.existsSync(fixturesDir)) {
    fs.readdirSync(fixturesDir).forEach(file => {
      if (testDbPattern.test(file)) {
        fs.unlinkSync(path.join(fixturesDir, file));
      }
    });
  }
});
```

## Example: Enabling Skipped Tests

Here's how to convert the skipped GCPPredictor tests:

```typescript
// tests/unit/predictors/gcp-predictor-vitest.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GCPPredictor } from '../../../src/predictors/gcp-predictor.js';
import type { RuvFannClient } from '../../../src/clients/ruv-fann-client.js';
import type { GCPPatternStorage } from '../../../src/storage/gcp-pattern-storage.js';

// Create mock implementations
const createMockRuvFannClient = (): RuvFannClient => ({
  predictPattern: vi.fn().mockResolvedValue({
    successProbability: 0.8,
    confidence: 0.9,
  }),
  spawnPatternAnalysisAgents: vi.fn().mockResolvedValue([]),
  // Add other methods as needed
} as any);

const createMockPatternStorage = (): GCPPatternStorage => ({
  getSimilarCommands: vi.fn().mockResolvedValue([]),
  getSuccessfulPatterns: vi.fn().mockResolvedValue([]),
  recordCommandPattern: vi.fn().mockResolvedValue(1),
  predictQueryCost: vi.fn().mockResolvedValue({ avgCost: 0.05, confidence: 0.8 }),
  getAuthFailureRate: vi.fn().mockResolvedValue(0.1),
  // Add other methods as needed
} as any);

describe('GCPPredictor with Vitest', () => {
  let predictor: GCPPredictor;
  let mockRuvFannClient: RuvFannClient;
  let mockPatternStorage: GCPPatternStorage;

  beforeEach(() => {
    // Create fresh mocks for each test
    mockRuvFannClient = createMockRuvFannClient();
    mockPatternStorage = createMockPatternStorage();
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

      vi.mocked(mockPatternStorage.getSimilarCommands).mockResolvedValue([
        {
          id: 1,
          tool,
          params: JSON.stringify(params),
          outcome: 'success',
          duration: 1000,
          timestamp: new Date(),
        },
      ]);

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
  });
});
```

## Benefits After Migration

1. **All Tests Run**: No more skipped tests due to ESM issues
2. **Faster Execution**: Vitest is significantly faster than Jest
3. **Better DX**: Hot module reloading, better error messages
4. **UI Mode**: Interactive test runner with `npm run test:ui`
5. **Proper Mocking**: ESM mocking that actually works

## Gradual Migration Strategy

1. **Phase 1**: Install Vitest alongside Jest
2. **Phase 2**: Convert skipped tests first (they're not running anyway)
3. **Phase 3**: Gradually convert other test files
4. **Phase 4**: Remove Jest once all tests are migrated

## Important Notes

### When to Use Mocks with Vitest

Even with better mocking support, follow our testing philosophy:
- Only mock external services and APIs
- Prefer real databases and components
- Use mocks for error scenarios that are hard to reproduce
- Always document why mocking was necessary

### Contract Testing with Mocks

When we do mock, verify the mock matches reality:

```typescript
// Contract test to verify mock accuracy
describe('RuvFannClient Mock Contract', () => {
  it('mock should match real API response shape', async () => {
    const mockResponse = await mockRuvFannClient.predictPattern({});
    
    // Verify shape matches documented API
    expect(mockResponse).toMatchObject({
      successProbability: expect.any(Number),
      confidence: expect.any(Number),
    });
    
    expect(mockResponse.successProbability).toBeGreaterThanOrEqual(0);
    expect(mockResponse.successProbability).toBeLessThanOrEqual(1);
  });
});
```

## Conclusion

Vitest provides the ESM support we need while maintaining our philosophy of minimal mocking. It enables us to:
- Run previously skipped tests
- Mock only when absolutely necessary
- Maintain fast, reliable test execution
- Keep our focus on testing with real components