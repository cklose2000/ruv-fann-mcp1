import { GCPPredictor } from '../../src/predictors/gcp-predictor.js';
import { GCPPatternStorage } from '../../src/storage/gcp-pattern-storage.js';
import { RuvFannClient } from '../../src/clients/ruv-fann-client.js';
import { PerformanceTracker } from '../utils/test-helpers.js';
import { MockFactory } from '../utils/mock-factory.js';
import fs from 'fs';
import path from 'path';

describe('Performance Tests', () => {
  let predictor: GCPPredictor;
  let patternStorage: GCPPatternStorage;
  let ruvFannClient: RuvFannClient;
  let tracker: PerformanceTracker;
  let testDbPath: string;

  beforeAll(async () => {
    // Set up performance test environment
    testDbPath = path.join(process.cwd(), 'tests', 'fixtures', 'performance-test.db');
    
    // Clean up if exists
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    // Initialize components
    patternStorage = new GCPPatternStorage(testDbPath);
    ruvFannClient = new RuvFannClient({
      coreUrl: 'http://localhost:8090',
      swarmUrl: 'http://localhost:8081', 
      modelUrl: 'http://localhost:8082',
    });
    predictor = new GCPPredictor(ruvFannClient, patternStorage);
    tracker = new PerformanceTracker();

    // Seed performance test data
    console.log('Seeding performance test data...');
    for (let i = 0; i < 1000; i++) {
      await patternStorage.recordCommandPattern({
        tool: 'bq-query',
        params: JSON.stringify({ query: `SELECT * FROM table_${i % 10}` }),
        context: JSON.stringify({ timestamp: Date.now() - i * 1000 }),
        outcome: i % 3 === 0 ? 'failure' : 'success',
        duration: Math.floor(Math.random() * 3000) + 500,
      });
    }
  });

  afterAll(() => {
    // Cleanup
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  });

  describe('Prediction Latency', () => {
    it('should complete predictions within 100ms', async () => {
      // Arrange
      const iterations = 50;
      const latencies: number[] = [];

      // Act
      for (let i = 0; i < iterations; i++) {
        const start = performance.now();
        
        await predictor.predictGCPOperation(
          'bq-query',
          { query: 'SELECT * FROM test_table' },
          { timestamp: Date.now() }
        );
        
        const latency = performance.now() - start;
        latencies.push(latency);
      }

      // Assert
      const avgLatency = latencies.reduce((a, b) => a + b, 0) / latencies.length;
      const maxLatency = Math.max(...latencies);
      
      console.log(`Prediction latency - Avg: ${avgLatency.toFixed(2)}ms, Max: ${maxLatency.toFixed(2)}ms`);
      
      expect(avgLatency).toBeLessThan(100);
      expect(maxLatency).toBeLessThan(200);
    });

    it('should maintain performance with different tool types', async () => {
      // Arrange
      const tools = ['bq-query', 'bq-list-datasets', 'bq-list-tables', 'gcp-sql'];
      tracker.clear();

      // Act
      for (const tool of tools) {
        for (let i = 0; i < 10; i++) {
          tracker.mark(`${tool}_start`);
          
          await predictor.predictGCPOperation(
            tool,
            MockFactory.generateRandomParams(tool),
            {}
          );
          
          tracker.measure(tool, `${tool}_start`);
        }
      }

      // Assert
      for (const tool of tools) {
        const stats = tracker.getStats(tool);
        expect(stats?.avgDuration).toBeLessThan(150);
        
        console.log(`${tool} performance - Avg: ${stats?.avgDuration.toFixed(2)}ms`);
      }
    });
  });

  describe('Pattern Storage Performance', () => {
    it('should handle high-volume pattern retrieval', async () => {
      // Arrange
      const retrievalCounts = [10, 50, 100, 200];
      
      // Act & Assert
      for (const count of retrievalCounts) {
        const start = performance.now();
        
        const patterns = await patternStorage.getSimilarCommands(
          'bq-query',
          { query: 'SELECT * FROM table' },
          count
        );
        
        const duration = performance.now() - start;
        
        expect(patterns).toHaveLength(count);
        expect(duration).toBeLessThan(count * 2); // Less than 2ms per pattern
        
        console.log(`Retrieved ${count} patterns in ${duration.toFixed(2)}ms`);
      }
    });

    it('should maintain write performance under load', async () => {
      // Arrange
      const writeCounts = [10, 50, 100];
      
      // Act & Assert
      for (const count of writeCounts) {
        const start = performance.now();
        
        for (let i = 0; i < count; i++) {
          await patternStorage.recordCommandPattern({
            tool: 'bq-query',
            params: JSON.stringify({ query: `PERF_TEST_${i}` }),
            context: JSON.stringify({ timestamp: Date.now() }),
            outcome: 'success',
            duration: 1000,
          });
        }
        
        const duration = performance.now() - start;
        const avgWriteTime = duration / count;
        
        expect(avgWriteTime).toBeLessThan(10); // Less than 10ms per write
        
        console.log(`Wrote ${count} patterns in ${duration.toFixed(2)}ms (${avgWriteTime.toFixed(2)}ms avg)`);
      }
    });
  });

  describe('Concurrent Operations', () => {
    it('should handle concurrent predictions efficiently', async () => {
      // Arrange
      const concurrencyLevels = [5, 10, 20];
      
      // Act & Assert
      for (const level of concurrencyLevels) {
        const start = performance.now();
        
        const promises = Array(level).fill(null).map((_, i) => 
          predictor.predictGCPOperation(
            'bq-query',
            { query: `SELECT ${i} FROM concurrent_test` },
            {}
          )
        );
        
        const results = await Promise.all(promises);
        const duration = performance.now() - start;
        const avgTime = duration / level;
        
        expect(results).toHaveLength(level);
        expect(avgTime).toBeLessThan(200); // Should benefit from concurrency
        
        console.log(`${level} concurrent predictions in ${duration.toFixed(2)}ms (${avgTime.toFixed(2)}ms avg)`);
      }
    });

    it('should not degrade with mixed operations', async () => {
      // Arrange
      const operations = [
        () => predictor.predictGCPOperation('bq-query', { query: 'SELECT 1' }, {}),
        () => patternStorage.getSimilarCommands('bq-query', {}, 10),
        () => patternStorage.recordCommandPattern({
          tool: 'bq-query',
          params: '{}',
          context: '{}',
          outcome: 'success',
          duration: 100,
        }),
      ];

      // Act
      const start = performance.now();
      const promises = [];
      
      // Mix different operations
      for (let i = 0; i < 30; i++) {
        const op = operations[i % operations.length];
        promises.push(op());
      }
      
      await Promise.all(promises);
      const duration = performance.now() - start;
      
      // Assert
      expect(duration).toBeLessThan(3000); // 30 mixed operations in < 3s
      console.log(`30 mixed operations completed in ${duration.toFixed(2)}ms`);
    });
  });

  describe('Memory Efficiency', () => {
    it('should not leak memory during repeated operations', async () => {
      // Arrange
      const initialMemory = process.memoryUsage().heapUsed;
      const iterations = 100;

      // Act
      for (let i = 0; i < iterations; i++) {
        await predictor.predictGCPOperation(
          'bq-query',
          { query: `SELECT * FROM memory_test_${i}` },
          {}
        );
        
        // Force cleanup of temporary objects
        if (i % 10 === 0 && global.gc) {
          global.gc();
        }
      }

      // Assert
      const finalMemory = process.memoryUsage().heapUsed;
      const memoryIncrease = (finalMemory - initialMemory) / 1024 / 1024; // MB
      
      console.log(`Memory increase after ${iterations} operations: ${memoryIncrease.toFixed(2)}MB`);
      
      // Allow some memory increase but not excessive
      expect(memoryIncrease).toBeLessThan(50); // Less than 50MB increase
    });
  });

  describe('Scalability', () => {
    it('should maintain performance as pattern database grows', async () => {
      // Arrange
      const measurements: Array<{patterns: number, avgTime: number}> = [];
      
      // Measure at different database sizes
      const sizes = [1000, 2000, 5000, 10000];
      
      for (const targetSize of sizes) {
        // Get current size
        const currentSize = patternStorage.db
          .prepare('SELECT COUNT(*) as count FROM gcp_command_patterns')
          .get() as any;
        
        // Add patterns to reach target size
        const toAdd = targetSize - currentSize.count;
        if (toAdd > 0) {
          for (let i = 0; i < toAdd; i++) {
            await patternStorage.recordCommandPattern({
              tool: 'bq-query',
              params: JSON.stringify({ query: `SCALE_${i}` }),
              context: JSON.stringify({ timestamp: Date.now() }),
              outcome: 'success',
              duration: 1000,
            });
          }
        }
        
        // Measure prediction performance
        const times: number[] = [];
        for (let i = 0; i < 10; i++) {
          const start = performance.now();
          await predictor.predictGCPOperation('bq-query', { query: 'test' }, {});
          times.push(performance.now() - start);
        }
        
        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;
        measurements.push({ patterns: targetSize, avgTime });
        
        console.log(`With ${targetSize} patterns: ${avgTime.toFixed(2)}ms avg prediction time`);
      }
      
      // Assert - performance should not degrade significantly
      const firstAvg = measurements[0].avgTime;
      const lastAvg = measurements[measurements.length - 1].avgTime;
      const degradation = (lastAvg - firstAvg) / firstAvg;
      
      expect(degradation).toBeLessThan(0.5); // Less than 50% degradation
    });
  });
});