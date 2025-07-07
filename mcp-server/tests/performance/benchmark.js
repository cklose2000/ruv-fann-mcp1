#!/usr/bin/env node

import { GCPPredictor } from '../../dist/predictors/gcp-predictor.js';
import { GCPPatternStorage } from '../../dist/storage/gcp-pattern-storage.js';
import { RuvFannClient } from '../../dist/clients/ruv-fann-client.js';
import { PerformanceTracker } from '../../dist/tests/utils/test-helpers.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Performance Benchmark Suite for ruv-FANN Enhanced MCP Server
 */
class PerformanceBenchmark {
  constructor() {
    this.tracker = new PerformanceTracker();
    this.results = [];
    this.dbPath = path.join(__dirname, 'benchmark.db');
  }

  async setup() {
    console.log('🚀 Setting up performance benchmark environment...\n');
    
    // Clean up previous benchmark database
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }

    // Initialize components
    this.patternStorage = new GCPPatternStorage(this.dbPath);
    this.ruvFannClient = new RuvFannClient({
      coreUrl: 'http://localhost:8090',
      swarmUrl: 'http://localhost:8081',
      modelUrl: 'http://localhost:8082',
    });
    this.predictor = new GCPPredictor(this.ruvFannClient, this.patternStorage);

    // Seed initial data
    await this.seedBenchmarkData();
  }

  async seedBenchmarkData() {
    console.log('📊 Seeding benchmark data...');
    
    // Insert patterns of varying sizes
    const patternCounts = [100, 500, 1000, 5000];
    
    for (const count of patternCounts) {
      const startTime = Date.now();
      
      for (let i = 0; i < count; i++) {
        await this.patternStorage.recordCommandPattern({
          tool: 'bq-query',
          params: JSON.stringify({ 
            query: `SELECT * FROM table_${i % 10} WHERE id = ${i}` 
          }),
          context: JSON.stringify({ timestamp: Date.now() - i * 1000 }),
          outcome: i % 3 === 0 ? 'failure' : 'success',
          duration: Math.floor(Math.random() * 5000) + 500,
          error: i % 3 === 0 ? 'Random error' : undefined,
          cost_estimate: Math.random() * 10,
          rows_processed: Math.floor(Math.random() * 100000),
        });
      }
      
      const duration = Date.now() - startTime;
      console.log(`  ✓ Inserted ${count} patterns in ${duration}ms`);
    }
  }

  async runBenchmarks() {
    console.log('\n🏃 Running performance benchmarks...\n');

    await this.benchmarkPredictionLatency();
    await this.benchmarkPatternMatching();
    await this.benchmarkDatabaseOperations();
    await this.benchmarkConcurrentPredictions();
    await this.benchmarkMemoryUsage();
    await this.benchmarkScalability();

    this.generateReport();
  }

  async benchmarkPredictionLatency() {
    console.log('📈 Benchmark 1: Prediction Latency');
    
    const iterations = 100;
    const testCases = [
      { tool: 'bq-query', params: { query: 'SELECT * FROM small_table' } },
      { tool: 'bq-list-datasets', params: { projectId: 'test-project' } },
      { tool: 'gcp-sql', params: { operation: 'list-tables', dataset: 'test' } },
    ];

    for (const testCase of testCases) {
      this.tracker.clear();
      
      for (let i = 0; i < iterations; i++) {
        this.tracker.mark('start');
        
        await this.predictor.predictGCPOperation(
          testCase.tool,
          testCase.params,
          { timestamp: Date.now() }
        );
        
        this.tracker.measure(`prediction_${testCase.tool}`, 'start');
      }
      
      const stats = this.tracker.getStats(`prediction_${testCase.tool}`);
      this.results.push(stats);
      
      console.log(`  ${testCase.tool}:`);
      console.log(`    Average: ${stats.avgDuration.toFixed(2)}ms`);
      console.log(`    P95: ${stats.p95Duration.toFixed(2)}ms`);
      console.log(`    P99: ${stats.p99Duration.toFixed(2)}ms`);
    }
  }

  async benchmarkPatternMatching() {
    console.log('\n📈 Benchmark 2: Pattern Matching Speed');
    
    const queryCounts = [10, 50, 100, 500];
    
    for (const count of queryCounts) {
      this.tracker.clear();
      
      for (let i = 0; i < 50; i++) {
        this.tracker.mark('start');
        
        await this.patternStorage.getSimilarCommands(
          'bq-query',
          { query: 'SELECT * FROM table' },
          count
        );
        
        this.tracker.measure(`pattern_matching_${count}`, 'start');
      }
      
      const stats = this.tracker.getStats(`pattern_matching_${count}`);
      this.results.push(stats);
      
      console.log(`  Retrieving ${count} patterns:`);
      console.log(`    Average: ${stats.avgDuration.toFixed(2)}ms`);
      console.log(`    P95: ${stats.p95Duration.toFixed(2)}ms`);
    }
  }

  async benchmarkDatabaseOperations() {
    console.log('\n📈 Benchmark 3: Database Operations');
    
    // Write performance
    this.tracker.clear();
    for (let i = 0; i < 100; i++) {
      this.tracker.mark('start');
      
      await this.patternStorage.recordCommandPattern({
        tool: 'bq-query',
        params: JSON.stringify({ query: `BENCHMARK_${i}` }),
        context: JSON.stringify({ timestamp: Date.now() }),
        outcome: 'success',
        duration: 1000,
      });
      
      this.tracker.measure('db_write', 'start');
    }
    
    const writeStats = this.tracker.getStats('db_write');
    this.results.push(writeStats);
    
    console.log('  Write Operations:');
    console.log(`    Average: ${writeStats.avgDuration.toFixed(2)}ms`);
    console.log(`    P95: ${writeStats.p95Duration.toFixed(2)}ms`);
    
    // Read performance
    this.tracker.clear();
    for (let i = 0; i < 100; i++) {
      this.tracker.mark('start');
      
      await this.patternStorage.getSuccessfulPatterns('bq-query', 20);
      
      this.tracker.measure('db_read', 'start');
    }
    
    const readStats = this.tracker.getStats('db_read');
    this.results.push(readStats);
    
    console.log('  Read Operations:');
    console.log(`    Average: ${readStats.avgDuration.toFixed(2)}ms`);
    console.log(`    P95: ${readStats.p95Duration.toFixed(2)}ms`);
  }

  async benchmarkConcurrentPredictions() {
    console.log('\n📈 Benchmark 4: Concurrent Predictions');
    
    const concurrencyLevels = [1, 5, 10, 20];
    
    for (const level of concurrencyLevels) {
      const startTime = Date.now();
      
      const promises = Array(level).fill(null).map(() => 
        this.predictor.predictGCPOperation(
          'bq-query',
          { query: 'SELECT * FROM concurrent_test' },
          {}
        )
      );
      
      await Promise.all(promises);
      const duration = Date.now() - startTime;
      
      console.log(`  ${level} concurrent predictions: ${duration}ms total`);
      console.log(`    Average per prediction: ${(duration / level).toFixed(2)}ms`);
    }
  }

  async benchmarkMemoryUsage() {
    console.log('\n📈 Benchmark 5: Memory Usage');
    
    const initialMemory = process.memoryUsage();
    console.log('  Initial memory:');
    console.log(`    Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    
    // Perform intensive operations
    const promises = [];
    for (let i = 0; i < 1000; i++) {
      promises.push(
        this.predictor.predictGCPOperation(
          'bq-query',
          { query: `SELECT * FROM memory_test_${i}` },
          {}
        )
      );
    }
    
    await Promise.all(promises);
    
    const peakMemory = process.memoryUsage();
    console.log('  Peak memory after 1000 predictions:');
    console.log(`    Heap: ${(peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`    Increase: ${((peakMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`);
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      const afterGC = process.memoryUsage();
      console.log('  After garbage collection:');
      console.log(`    Heap: ${(afterGC.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  async benchmarkScalability() {
    console.log('\n📈 Benchmark 6: Scalability Test');
    
    const patternCounts = [1000, 5000, 10000, 20000];
    
    for (const count of patternCounts) {
      // Get current pattern count
      const currentCount = this.patternStorage.db
        .prepare('SELECT COUNT(*) as count FROM gcp_command_patterns')
        .get().count;
      
      this.tracker.clear();
      
      // Measure prediction time with different data sizes
      for (let i = 0; i < 20; i++) {
        this.tracker.mark('start');
        
        await this.predictor.predictGCPOperation(
          'bq-query',
          { query: 'SELECT * FROM scalability_test' },
          {}
        );
        
        this.tracker.measure(`scale_${currentCount}`, 'start');
      }
      
      const stats = this.tracker.getStats(`scale_${currentCount}`);
      
      console.log(`  With ${currentCount} patterns in database:`);
      console.log(`    Average prediction time: ${stats.avgDuration.toFixed(2)}ms`);
      
      // Add more patterns for next iteration
      if (count < patternCounts[patternCounts.length - 1]) {
        const toAdd = patternCounts[patternCounts.indexOf(count) + 1] - currentCount;
        for (let i = 0; i < toAdd; i++) {
          await this.patternStorage.recordCommandPattern({
            tool: 'bq-query',
            params: JSON.stringify({ query: `SCALE_TEST_${i}` }),
            context: JSON.stringify({ timestamp: Date.now() }),
            outcome: 'success',
            duration: 1000,
          });
        }
      }
    }
  }

  generateReport() {
    console.log('\n📊 Performance Benchmark Summary');
    console.log('================================\n');
    
    const report = {
      timestamp: new Date().toISOString(),
      environment: {
        node: process.version,
        platform: process.platform,
        memory: `${Math.round(require('os').totalmem() / 1024 / 1024 / 1024)}GB`,
      },
      results: this.results.filter(r => r !== null),
      summary: {
        avgPredictionLatency: this.calculateAvgPredictionLatency(),
        p95PredictionLatency: this.calculateP95PredictionLatency(),
        patternMatchingSpeed: this.calculatePatternMatchingSpeed(),
        recommendedLimits: {
          maxConcurrentPredictions: 20,
          maxPatternsForRealtime: 10000,
          targetPredictionLatency: 50, // ms
        },
      },
    };
    
    // Save report
    const reportPath = path.join(__dirname, 'benchmark-report.json');
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    
    console.log('Key Metrics:');
    console.log(`  Average Prediction Latency: ${report.summary.avgPredictionLatency.toFixed(2)}ms`);
    console.log(`  P95 Prediction Latency: ${report.summary.p95PredictionLatency.toFixed(2)}ms`);
    console.log(`  Pattern Matching Speed: ${report.summary.patternMatchingSpeed.toFixed(2)} patterns/ms`);
    
    console.log('\n✅ Benchmark complete! Report saved to:', reportPath);
  }

  calculateAvgPredictionLatency() {
    const predictionResults = this.results.filter(r => 
      r.operation.startsWith('prediction_')
    );
    if (predictionResults.length === 0) return 0;
    
    const totalAvg = predictionResults.reduce((sum, r) => sum + r.avgDuration, 0);
    return totalAvg / predictionResults.length;
  }

  calculateP95PredictionLatency() {
    const predictionResults = this.results.filter(r => 
      r.operation.startsWith('prediction_')
    );
    if (predictionResults.length === 0) return 0;
    
    const allP95s = predictionResults.map(r => r.p95Duration);
    return Math.max(...allP95s);
  }

  calculatePatternMatchingSpeed() {
    const matchingResult = this.results.find(r => 
      r.operation === 'pattern_matching_100'
    );
    if (!matchingResult) return 0;
    
    // 100 patterns retrieved in X ms = patterns per ms
    return 100 / matchingResult.avgDuration;
  }

  async cleanup() {
    if (fs.existsSync(this.dbPath)) {
      fs.unlinkSync(this.dbPath);
    }
  }
}

// Run benchmark
async function main() {
  const benchmark = new PerformanceBenchmark();
  
  try {
    await benchmark.setup();
    await benchmark.runBenchmarks();
  } catch (error) {
    console.error('❌ Benchmark failed:', error);
    process.exit(1);
  } finally {
    await benchmark.cleanup();
  }
}

// Check if running with --gc flag for memory benchmarks
if (process.argv.includes('--gc')) {
  console.log('🔧 Running with garbage collection exposed\n');
  require('v8').setFlagsFromString('--expose-gc');
  global.gc = require('vm').runInNewContext('gc');
}

main().catch(console.error);