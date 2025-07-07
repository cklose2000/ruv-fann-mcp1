#!/usr/bin/env node

import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Simple performance tracker for benchmarks
class PerformanceTracker {
  constructor() {
    this.marks = new Map();
    this.measures = new Map();
  }

  mark(name) {
    this.marks.set(name, process.hrtime.bigint());
  }

  measure(name, startMark) {
    const startTime = this.marks.get(startMark);
    if (!startTime) return;

    const duration = Number(process.hrtime.bigint() - startTime) / 1e6; // Convert to ms
    
    if (!this.measures.has(name)) {
      this.measures.set(name, []);
    }
    this.measures.get(name).push(duration);
  }

  getStats(name) {
    const measures = this.measures.get(name) || [];
    if (measures.length === 0) return null;

    const sorted = [...measures].sort((a, b) => a - b);
    const sum = measures.reduce((a, b) => a + b, 0);
    
    return {
      measurement: name,
      count: measures.length,
      avgDuration: sum / measures.length,
      p50: sorted[Math.floor(sorted.length * 0.5)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      minDuration: Math.min(...measures),
      maxDuration: Math.max(...measures),
    };
  }

  clear() {
    this.marks.clear();
    this.measures.clear();
  }
}

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

    // Create a simple mock database for benchmarking
    this.db = new Database(this.dbPath);
    
    // Create tables
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS gcp_command_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        params TEXT NOT NULL,
        context TEXT,
        outcome TEXT NOT NULL,
        duration INTEGER,
        error TEXT,
        cost_estimate REAL,
        rows_processed INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Seed initial data
    await this.seedBenchmarkData();
  }

  async seedBenchmarkData() {
    console.log('📊 Seeding benchmark data...');
    
    // Insert patterns of varying sizes
    const patternCounts = [100, 500, 1000, 5000];
    const stmt = this.db.prepare(`
      INSERT INTO gcp_command_patterns 
      (tool, params, context, outcome, duration, error, cost_estimate, rows_processed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    
    for (const count of patternCounts) {
      const startTime = Date.now();
      
      this.db.prepare('BEGIN').run();
      
      for (let i = 0; i < count; i++) {
        stmt.run(
          'bq-query',
          JSON.stringify({ 
            query: `SELECT * FROM table_${i % 10} WHERE id = ${i}` 
          }),
          JSON.stringify({ timestamp: Date.now() - i * 1000 }),
          i % 3 === 0 ? 'failure' : 'success',
          Math.floor(Math.random() * 5000) + 500,
          i % 3 === 0 ? 'Random error' : null,
          Math.random() * 10,
          Math.floor(Math.random() * 100000)
        );
      }
      
      this.db.prepare('COMMIT').run();
      
      const duration = Date.now() - startTime;
      console.log(`  ✓ Inserted ${count} patterns in ${duration}ms`);
    }
  }

  async runBenchmarks() {
    console.log('\n🏃 Running performance benchmarks...\n');

    await this.benchmarkDatabaseOperations();
    await this.benchmarkPatternMatching();
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
      console.log(`    P95: ${stats.p95.toFixed(2)}ms`);
      console.log(`    P99: ${stats.p99.toFixed(2)}ms`);
    }
  }

  async benchmarkPatternMatching() {
    console.log('\n📈 Benchmark 2: Pattern Matching Speed');
    
    const queryCounts = [10, 50, 100, 500];
    
    const stmt = this.db.prepare(`
      SELECT * FROM gcp_command_patterns 
      WHERE tool = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
    
    for (const count of queryCounts) {
      this.tracker.clear();
      
      for (let i = 0; i < 50; i++) {
        this.tracker.mark('start');
        
        stmt.all('bq-query', count);
        
        this.tracker.measure(`pattern_matching_${count}`, 'start');
      }
      
      const stats = this.tracker.getStats(`pattern_matching_${count}`);
      this.results.push(stats);
      
      console.log(`  Retrieving ${count} patterns:`);
      console.log(`    Average: ${stats.avgDuration.toFixed(2)}ms`);
      console.log(`    P95: ${stats.p95.toFixed(2)}ms`);
    }
  }

  async benchmarkDatabaseOperations() {
    console.log('\n📈 Benchmark 1: Database Operations');
    
    const stmt = this.db.prepare(`
      INSERT INTO gcp_command_patterns 
      (tool, params, context, outcome, duration)
      VALUES (?, ?, ?, ?, ?)
    `);
    
    // Write performance
    this.tracker.clear();
    for (let i = 0; i < 100; i++) {
      this.tracker.mark('start');
      
      stmt.run(
        'bq-query',
        JSON.stringify({ query: `BENCHMARK_${i}` }),
        JSON.stringify({ timestamp: Date.now() }),
        'success',
        1000
      );
      
      this.tracker.measure('db_write', 'start');
    }
    
    const writeStats = this.tracker.getStats('db_write');
    this.results.push(writeStats);
    
    console.log('  Write Operations:');
    console.log(`    Average: ${writeStats.avgDuration.toFixed(2)}ms`);
    console.log(`    P95: ${writeStats.p95.toFixed(2)}ms`);
    
    // Read performance
    const readStmt = this.db.prepare(`
      SELECT * FROM gcp_command_patterns 
      WHERE tool = ? AND outcome = 'success'
      ORDER BY timestamp DESC 
      LIMIT 20
    `);
    
    this.tracker.clear();
    for (let i = 0; i < 100; i++) {
      this.tracker.mark('start');
      
      readStmt.all('bq-query');
      
      this.tracker.measure('db_read', 'start');
    }
    
    const readStats = this.tracker.getStats('db_read');
    this.results.push(readStats);
    
    console.log('  Read Operations:');
    console.log(`    Average: ${readStats.avgDuration.toFixed(2)}ms`);
    console.log(`    P95: ${readStats.p95.toFixed(2)}ms`);
  }


  async benchmarkMemoryUsage() {
    console.log('\n📈 Benchmark 3: Memory Usage');
    
    const initialMemory = process.memoryUsage();
    console.log('  Initial memory:');
    console.log(`    Heap: ${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    
    // Perform intensive database operations
    const readStmt = this.db.prepare(`
      SELECT * FROM gcp_command_patterns 
      WHERE tool = ? 
      ORDER BY timestamp DESC 
      LIMIT 100
    `);
    
    const results = [];
    for (let i = 0; i < 1000; i++) {
      results.push(readStmt.all('bq-query'));
    }
    
    const peakMemory = process.memoryUsage();
    console.log('  Peak memory after 1000 queries:');
    console.log(`    Heap: ${(peakMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    console.log(`    Increase: ${((peakMemory.heapUsed - initialMemory.heapUsed) / 1024 / 1024).toFixed(2)}MB`);
    
    // Clear results
    results.length = 0;
    
    // Force garbage collection if available
    if (global.gc) {
      global.gc();
      const afterGC = process.memoryUsage();
      console.log('  After garbage collection:');
      console.log(`    Heap: ${(afterGC.heapUsed / 1024 / 1024).toFixed(2)}MB`);
    }
  }

  async benchmarkScalability() {
    console.log('\n📈 Benchmark 4: Scalability Test');
    
    const patternCounts = [1000, 5000, 10000, 20000];
    
    for (const count of patternCounts) {
      // Get current pattern count
      const currentCount = this.db
        .prepare('SELECT COUNT(*) as count FROM gcp_command_patterns')
        .get().count;
      
      console.log(`  Testing with ${currentCount} patterns in database`);
      
      this.tracker.clear();
      
      // Measure query time with different data sizes
      const queryStmt = this.db.prepare(`
        SELECT * FROM gcp_command_patterns 
        WHERE tool = ? AND params LIKE ?
        ORDER BY timestamp DESC 
        LIMIT 50
      `);
      
      for (let i = 0; i < 20; i++) {
        this.tracker.mark('start');
        
        queryStmt.all('bq-query', '%SELECT%');
        
        this.tracker.measure(`scale_${currentCount}`, 'start');
      }
      
      const stats = this.tracker.getStats(`scale_${currentCount}`);
      this.results.push(stats);
      
      console.log(`    Average query time: ${stats.avgDuration.toFixed(2)}ms`);
      console.log(`    P95: ${stats.p95.toFixed(2)}ms`);
      
      // Add more patterns for next iteration if needed
      if (currentCount < count) {
        const toAdd = count - currentCount;
        const insertStmt = this.db.prepare(`
          INSERT INTO gcp_command_patterns 
          (tool, params, context, outcome, duration)
          VALUES (?, ?, ?, ?, ?)
        `);
        
        this.db.prepare('BEGIN').run();
        
        for (let i = 0; i < toAdd; i++) {
          insertStmt.run(
            'bq-query',
            JSON.stringify({ query: `SCALE_TEST_${i}` }),
            JSON.stringify({ timestamp: Date.now() }),
            'success',
            1000
          );
        }
        
        this.db.prepare('COMMIT').run();
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
        memory: `${Math.round(os.totalmem() / 1024 / 1024 / 1024)}GB`,
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
    const dbResults = this.results.filter(r => 
      r.measurement && (r.measurement.startsWith('db_') || r.measurement.startsWith('pattern_'))
    );
    if (dbResults.length === 0) return 0;
    
    const totalAvg = dbResults.reduce((sum, r) => sum + r.avgDuration, 0);
    return totalAvg / dbResults.length;
  }

  calculateP95PredictionLatency() {
    const dbResults = this.results.filter(r => 
      r.measurement && (r.measurement.startsWith('db_') || r.measurement.startsWith('pattern_'))
    );
    if (dbResults.length === 0) return 0;
    
    const allP95s = dbResults.map(r => r.p95);
    return Math.max(...allP95s);
  }

  calculatePatternMatchingSpeed() {
    const matchingResult = this.results.find(r => 
      r.measurement === 'pattern_matching_100'
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