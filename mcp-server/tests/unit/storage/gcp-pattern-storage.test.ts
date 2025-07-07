import { GCPPatternStorage } from '../../../src/storage/gcp-pattern-storage.js';
import { TestHelpers } from '../../utils/test-helpers.js';
import { MockFactory } from '../../utils/mock-factory.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

describe('GCPPatternStorage', () => {
  let storage: GCPPatternStorage;
  let testDbPath: string;

  beforeEach(() => {
    // Create a test database
    testDbPath = path.join(process.cwd(), 'tests', 'fixtures', 'test-gcp-patterns.db');
    
    // Ensure test directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    
    // Remove existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
    
    // Create storage instance with test database
    storage = new GCPPatternStorage(testDbPath);
  });

  afterEach(() => {
    // Clean up
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Command Pattern Storage', () => {
    it('should record command patterns', async () => {
      // Arrange
      const pattern = {
        tool: 'bq-query',
        params: JSON.stringify({ query: 'SELECT * FROM table' }),
        context: JSON.stringify({ timestamp: Date.now() }),
        outcome: 'success' as const,
        duration: 1500,
        cost_estimate: 0.05,
        rows_processed: 1000,
      };

      // Act
      const id = await storage.recordCommandPattern(pattern);

      // Assert
      expect(id).toBeGreaterThan(0);
      
      // Verify the pattern was stored
      const patterns = await storage.getSimilarCommands('bq-query', {}, 10);
      expect(patterns).toHaveLength(1);
      expect(patterns[0].tool).toBe('bq-query');
    });

    it('should retrieve similar commands', async () => {
      // Arrange
      const tool = 'bq-query';
      const baseParams = { query: 'SELECT * FROM dataset.table' };
      
      // Record multiple patterns with slight delays to ensure different timestamps
      for (let i = 0; i < 5; i++) {
        await storage.recordCommandPattern({
          tool,
          params: JSON.stringify({ ...baseParams, limit: i * 10 }),
          context: JSON.stringify({ timestamp: Date.now() - i * 1000 }),
          outcome: i % 2 === 0 ? 'success' : 'failure',
          duration: 1000 + i * 100,
        });
        // Small delay to ensure different timestamps
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Act
      const patterns = await storage.getSimilarCommands(tool, baseParams, 3);

      // Assert
      expect(patterns).toHaveLength(3);
      expect(patterns[0].tool).toBe(tool);
      // Should be ordered by timestamp DESC
      expect(patterns[0].timestamp.getTime()).toBeGreaterThan(patterns[1].timestamp.getTime());
    });

    it('should filter successful patterns', async () => {
      // Arrange
      const tool = 'bq-list-datasets';
      
      // Record mixed patterns
      for (let i = 0; i < 10; i++) {
        await storage.recordCommandPattern({
          tool,
          params: JSON.stringify({ projectId: 'test' }),
          context: JSON.stringify({ timestamp: Date.now() }),
          outcome: i < 7 ? 'success' : 'failure',
          duration: 200,
          error: i >= 7 ? 'Permission denied' : undefined,
        });
      }

      // Act
      const successfulPatterns = await storage.getSuccessfulPatterns(tool, 10);

      // Assert
      expect(successfulPatterns).toHaveLength(7);
      expect(successfulPatterns.every(p => p.outcome === 'success')).toBe(true);
    });
  });

  describe('Query Pattern Analysis', () => {
    it('should record query patterns', async () => {
      // Arrange
      const queryPattern = {
        query_type: 'SELECT',
        table_size_gb: 2.5,
        execution_time_ms: 3500,
        cost_usd: 0.0125,
        rows_returned: 50000,
        success: true,
      };

      // Act
      const id = await storage.recordQueryPattern(queryPattern);

      // Assert
      expect(id).toBeGreaterThan(0);
    });

    it('should predict query costs based on history', async () => {
      // Arrange
      const queryType = 'SELECT';
      
      // Record historical cost data
      for (let i = 0; i < 20; i++) {
        await storage.recordQueryPattern({
          query_type: queryType,
          table_size_gb: 1.0 + i * 0.1,
          execution_time_ms: 1000 + i * 100,
          cost_usd: 0.005 * (1.0 + i * 0.1), // $5 per TB
          rows_returned: 10000 * (i + 1),
          success: true,
        });
      }

      // Act
      const prediction = await storage.predictQueryCost(queryType, 2.0);

      // Assert
      expect(prediction.avgCost).toBeGreaterThan(0);
      expect(prediction.avgCost).toBeLessThan(0.02); // Should be around $0.01 for 2GB
      expect(prediction.confidence).toBeGreaterThan(0.5);
    });

    it('should return low confidence for insufficient data', async () => {
      // Arrange - no data recorded

      // Act
      const prediction = await storage.predictQueryCost('DELETE', 1.0);

      // Assert
      expect(prediction.avgCost).toBe(0);
      expect(prediction.confidence).toBe(0);
    });
  });

  describe('Authentication Patterns', () => {
    it('should track auth failure patterns', async () => {
      // Arrange
      const patterns = [
        { tokenAge: 30, success: true },
        { tokenAge: 45, success: true },
        { tokenAge: 65, success: false }, // Old token
        { tokenAge: 70, success: false },
        { tokenAge: 75, success: false },
      ];

      // Record patterns
      for (const pattern of patterns) {
        await storage.recordAuthPattern({
          token_age_minutes: pattern.tokenAge,
          operation_type: 'bq-query',
          success: pattern.success,
          error_message: pattern.success ? undefined : 'Token expired',
        });
      }

      // Act
      const failureRate = await storage.getAuthFailureRate(60); // Tokens older than 60 minutes

      // Assert
      expect(failureRate).toBeGreaterThan(0.5); // Should show high failure rate
    });

    it('should identify token age threshold', async () => {
      // Arrange
      // Create clear pattern: tokens fail after 60 minutes
      for (let age = 0; age <= 120; age += 5) {
        await storage.recordAuthPattern({
          token_age_minutes: age,
          operation_type: 'bq-list-datasets',
          success: age < 60,
          error_message: age >= 60 ? 'Authentication failed' : undefined,
        });
      }

      // Act
      const youngTokenFailure = await storage.getAuthFailureRate(30);
      const oldTokenFailure = await storage.getAuthFailureRate(90);

      // Assert
      expect(youngTokenFailure).toBeLessThan(0.1); // Young tokens should work
      expect(oldTokenFailure).toBeGreaterThan(0.9); // Old tokens should fail
    });
  });

  describe('User Behavior Patterns', () => {
    it('should track user patterns', async () => {
      // Arrange
      const userId = 'test-user';
      const patterns = {
        common_projects: ['project-a', 'project-b'],
        frequent_datasets: ['analytics', 'reporting'],
        typical_operations: ['SELECT', 'JOIN'],
        error_patterns: ['syntax_error', 'permission_denied'],
      };

      // Act
      await storage.updateUserPatterns(userId, patterns);
      const retrieved = await storage.getUserPatterns(userId);

      // Assert
      expect(retrieved).toBeDefined();
      expect(retrieved?.common_projects).toEqual(patterns.common_projects);
      expect(retrieved?.frequent_datasets).toEqual(patterns.frequent_datasets);
    });

    it('should update existing user patterns', async () => {
      // Arrange
      const userId = 'test-user';
      
      // First update
      await storage.updateUserPatterns(userId, {
        common_projects: ['project-a'],
        frequent_datasets: ['dataset-a'],
        typical_operations: ['SELECT'],
        error_patterns: [],
      });

      // Second update
      await storage.updateUserPatterns(userId, {
        common_projects: ['project-a', 'project-b'],
        frequent_datasets: ['dataset-a', 'dataset-b'],
        typical_operations: ['SELECT', 'INSERT'],
        error_patterns: ['timeout'],
      });

      // Act
      const patterns = await storage.getUserPatterns(userId);

      // Assert
      expect(patterns?.common_projects).toHaveLength(2);
      expect(patterns?.error_patterns).toHaveLength(1);
    });
  });

  describe('Analytics Methods', () => {
    it('should calculate average query duration by type', async () => {
      // Arrange
      const queryTypes = ['SELECT', 'INSERT', 'UPDATE'];
      
      for (const type of queryTypes) {
        for (let i = 0; i < 10; i++) {
          await storage.recordQueryPattern({
            query_type: type,
            execution_time_ms: 1000 * (queryTypes.indexOf(type) + 1) + i * 100,
            cost_usd: 0.01,
            rows_returned: 1000,
            success: true,
          });
        }
      }

      // Act
      const avgDuration = await storage.getAverageQueryDuration('SELECT');

      // Assert
      expect(avgDuration).toBeGreaterThan(1000);
      expect(avgDuration).toBeLessThan(2000);
    });

    it('should get query success rate', async () => {
      // Arrange
      const queryType = 'DELETE';
      
      // Record 7 successes and 3 failures
      for (let i = 0; i < 10; i++) {
        await storage.recordQueryPattern({
          query_type: queryType,
          execution_time_ms: 500,
          rows_returned: i < 7 ? 1 : 0,
          success: i < 7,
          error_type: i >= 7 ? 'PERMISSION_DENIED' : undefined,
        });
      }

      // Act
      const successRate = await storage.getQuerySuccessRate(queryType);

      // Assert
      expect(successRate).toBeCloseTo(0.7, 2);
    });
  });

  describe('Performance', () => {
    it('should handle large pattern volumes efficiently', async () => {
      // Arrange - Insert 1000 patterns
      const startTime = Date.now();
      
      for (let i = 0; i < 1000; i++) {
        await storage.recordCommandPattern({
          tool: 'bq-query',
          params: JSON.stringify({ query: `SELECT ${i} FROM table` }),
          context: JSON.stringify({ timestamp: Date.now() }),
          outcome: i % 2 === 0 ? 'success' : 'failure',
          duration: Math.floor(Math.random() * 5000),
        });
      }

      // Act
      const queryStart = Date.now();
      const patterns = await storage.getSimilarCommands('bq-query', {}, 100);

      // Assert
      const insertTime = queryStart - startTime;
      const queryTime = Date.now() - queryStart;
      
      expect(patterns).toHaveLength(100);
      expect(queryTime).toBeLessThan(50); // Query should be fast
      console.log(`Inserted 1000 patterns in ${insertTime}ms, queried in ${queryTime}ms`);
    });
  });
});