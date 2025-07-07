import { beforeAll, afterAll, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';

// Environment variable setup
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error'; // Reduce log noise during tests

// Global test setup
beforeAll(() => {
  console.log('🧪 Setting up test environment...');
  
  // Ensure test directories exist
  const testDirs = [
    'tests/fixtures',
    'tests/fixtures/integration',
    'tests/reports',
    'tests/coverage',
  ];
  
  testDirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
  
  // Set test environment variables
  process.env.RUV_FANN_CORE_URL = process.env.RUV_FANN_CORE_URL || 'http://localhost:8090';
  process.env.RUV_FANN_SWARM_URL = process.env.RUV_FANN_SWARM_URL || 'http://localhost:8081';
  process.env.RUV_FANN_MODEL_URL = process.env.RUV_FANN_MODEL_URL || 'http://localhost:8082';
  process.env.GCP_MCP_BACKEND_URL = process.env.GCP_MCP_BACKEND_URL || 'http://localhost:8080';
});

// Cleanup after each test
afterEach(() => {
  // Clean up test databases created during tests
  const testDbPattern = /test.*\.db$/;
  const fixturesDir = path.join(process.cwd(), 'tests/fixtures');
  
  if (fs.existsSync(fixturesDir)) {
    fs.readdirSync(fixturesDir).forEach(file => {
      if (testDbPattern.test(file)) {
        try {
          fs.unlinkSync(path.join(fixturesDir, file));
        } catch (error) {
          // Ignore errors - file might be in use
        }
      }
    });
  }
});

// Global teardown
afterAll(() => {
  console.log('🧹 Cleaning up test environment...');
  
  // Final cleanup of any remaining test artifacts
  const tempDirs = ['tests/fixtures/temp', 'tests/reports/temp'];
  
  tempDirs.forEach(dir => {
    const fullPath = path.join(process.cwd(), dir);
    if (fs.existsSync(fullPath)) {
      fs.rmSync(fullPath, { recursive: true, force: true });
    }
  });
});

// Custom matchers for better assertions
expect.extend({
  toBeWithinRange(received: number, floor: number, ceiling: number) {
    const pass = received >= floor && received <= ceiling;
    if (pass) {
      return {
        message: () =>
          `expected ${received} not to be within range ${floor} - ${ceiling}`,
        pass: true,
      };
    } else {
      return {
        message: () =>
          `expected ${received} to be within range ${floor} - ${ceiling}`,
        pass: false,
      };
    }
  },
  
  toHavePredictionShape(received: any) {
    const expectedShape = {
      successProbability: expect.any(Number),
      confidence: expect.any(Number),
      warnings: expect.any(Array),
      suggestions: expect.any(Array),
    };
    
    try {
      expect(received).toMatchObject(expectedShape);
      return {
        message: () => `expected ${received} not to have prediction shape`,
        pass: true,
      };
    } catch {
      return {
        message: () => `expected ${received} to have prediction shape`,
        pass: false,
      };
    }
  },
});

// Type declarations for custom matchers
declare module 'vitest' {
  interface Assertion<T = any> {
    toBeWithinRange(floor: number, ceiling: number): T;
    toHavePredictionShape(): T;
  }
}

// Performance tracking utilities
export const performanceHelpers = {
  startTimer(): number {
    return performance.now();
  },
  
  endTimer(start: number): number {
    return performance.now() - start;
  },
  
  expectPerformance(duration: number, maxMs: number, label: string = 'Operation') {
    expect(duration).toBeLessThan(maxMs);
    if (duration > maxMs * 0.8) {
      console.warn(`⚠️  ${label} took ${duration.toFixed(2)}ms (close to ${maxMs}ms limit)`);
    }
  },
};

// Database test helpers
export const dbHelpers = {
  async createTestDb(name: string): Promise<string> {
    const dbPath = path.join(process.cwd(), 'tests/fixtures', `${name}-${Date.now()}.db`);
    return dbPath;
  },
  
  cleanupDb(dbPath: string) {
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  },
};

// Mock data consistency helpers
export const mockHelpers = {
  // Ensure mock responses match expected API shapes
  validateMockResponse(mock: any, schema: Record<string, any>) {
    Object.entries(schema).forEach(([key, type]) => {
      expect(mock).toHaveProperty(key);
      expect(typeof mock[key]).toBe(type);
    });
  },
  
  // Create consistent test data
  createConsistentTestData(seed: number = 42) {
    // Use a seeded random for reproducible tests
    let currentSeed = seed;
    const random = () => {
      currentSeed = (currentSeed * 9301 + 49297) % 233280;
      return currentSeed / 233280;
    };
    
    return {
      randomInt: (min: number, max: number) => 
        Math.floor(random() * (max - min + 1)) + min,
      randomFloat: (min: number, max: number) => 
        random() * (max - min) + min,
      randomChoice: <T>(array: T[]): T => 
        array[Math.floor(random() * array.length)],
    };
  },
};