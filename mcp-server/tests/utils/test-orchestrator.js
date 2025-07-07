/**
 * Test Orchestrator for ruv-FANN MCP
 * 
 * Manages parallel test execution, result collection, and reporting
 */

import { EventEmitter } from 'events';
import os from 'os';
import { performance } from 'perf_hooks';

export class TestOrchestrator extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.concurrency = options.concurrency || Math.max(1, os.cpus().length - 1);
    this.timeout = options.timeout || 30000;
    this.retries = options.retries || 2;
    this.results = [];
    this.workers = [];
    this.queue = [];
    this.running = false;
    this.startTime = null;
    this.stats = {
      total: 0,
      completed: 0,
      passed: 0,
      failed: 0,
      errors: 0,
      timeouts: 0,
      retried: 0
    };
  }

  async run(testSuite) {
    this.running = true;
    this.startTime = performance.now();
    this.stats.total = testSuite.length;
    
    // Reset state
    this.results = [];
    this.queue = [...testSuite];
    
    this.emit('start', {
      totalTests: this.stats.total,
      concurrency: this.concurrency
    });
    
    // Start workers
    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(this.runWorker(i));
    }
    
    // Wait for all workers to complete
    await Promise.all(workers);
    
    const duration = performance.now() - this.startTime;
    this.running = false;
    
    const summary = this.generateSummary(duration);
    this.emit('complete', summary);
    
    return summary;
  }

  async runWorker(workerId) {
    while (this.queue.length > 0 && this.running) {
      const test = this.queue.shift();
      if (!test) break;
      
      await this.executeTest(test, workerId);
    }
  }

  async executeTest(test, workerId, retryCount = 0) {
    const testStart = performance.now();
    
    this.emit('testStart', {
      test,
      workerId,
      retryCount
    });
    
    try {
      // Run test with timeout
      const result = await this.runWithTimeout(
        test.execute(test.client || this.client),
        this.timeout
      );
      
      const duration = performance.now() - testStart;
      
      const testResult = {
        id: test.id,
        name: test.name,
        passed: this.evaluateResult(test, result),
        duration,
        result,
        expected: {
          outcome: test.expectedOutcome,
          failureType: test.expectedFailureType,
          cost: test.expectedCost,
          duration: test.expectedDuration
        },
        retryCount
      };
      
      this.results.push(testResult);
      this.stats.completed++;
      
      if (testResult.passed) {
        this.stats.passed++;
      } else {
        this.stats.failed++;
      }
      
      this.emit('testComplete', {
        test: testResult,
        workerId,
        progress: (this.stats.completed / this.stats.total) * 100
      });
      
    } catch (error) {
      const duration = performance.now() - testStart;
      
      // Check if we should retry
      if (retryCount < this.retries && this.isRetriableError(error)) {
        this.stats.retried++;
        this.emit('testRetry', {
          test,
          workerId,
          error: error.message,
          retryCount: retryCount + 1
        });
        
        // Exponential backoff
        await new Promise(resolve => 
          setTimeout(resolve, Math.pow(2, retryCount) * 1000)
        );
        
        return this.executeTest(test, workerId, retryCount + 1);
      }
      
      // Record failed test
      const testResult = {
        id: test.id,
        name: test.name,
        passed: false,
        duration,
        error: error.message,
        stack: error.stack,
        retryCount,
        timeout: error.name === 'TimeoutError'
      };
      
      this.results.push(testResult);
      this.stats.completed++;
      this.stats.errors++;
      
      if (error.name === 'TimeoutError') {
        this.stats.timeouts++;
      }
      
      this.emit('testError', {
        test: testResult,
        workerId
      });
    }
  }

  evaluateResult(test, result) {
    // Basic evaluation - can be overridden for specific test types
    if (test.evaluate) {
      return test.evaluate(result);
    }
    
    // Default evaluation based on expected outcome
    if (test.expectedOutcome === 'failure') {
      // For failure cases, check if it was predicted/blocked
      return result.prediction?.blocked || 
             result.prediction?.successProbability < 0.5;
    } else {
      // For success cases, check if it wasn't blocked
      return !result.prediction?.blocked && 
             (!result.prediction || result.prediction.successProbability >= 0.5);
    }
  }

  runWithTimeout(promise, timeout) {
    return Promise.race([
      promise,
      new Promise((_, reject) => 
        setTimeout(() => {
          const error = new Error(`Test timed out after ${timeout}ms`);
          error.name = 'TimeoutError';
          reject(error);
        }, timeout)
      )
    ]);
  }

  isRetriableError(error) {
    // Determine if error is retriable
    const retriableErrors = [
      'ECONNREFUSED',
      'ECONNRESET',
      'ETIMEDOUT',
      'ENOTFOUND',
      'TimeoutError'
    ];
    
    return retriableErrors.some(code => 
      error.code === code || error.name === code
    );
  }

  generateSummary(duration) {
    const accuracyByCategory = this.calculateAccuracyByCategory();
    const overallAccuracy = this.stats.total > 0 
      ? (this.stats.passed / this.stats.total) * 100 
      : 0;
    
    return {
      duration: duration / 1000, // Convert to seconds
      stats: this.stats,
      overallAccuracy,
      accuracyByCategory,
      results: this.results,
      performance: this.calculatePerformanceMetrics()
    };
  }

  calculateAccuracyByCategory() {
    const categories = {};
    
    for (const result of this.results) {
      const category = result.expected?.failureType || 'success';
      
      if (!categories[category]) {
        categories[category] = {
          total: 0,
          passed: 0,
          accuracy: 0
        };
      }
      
      categories[category].total++;
      if (result.passed) {
        categories[category].passed++;
      }
    }
    
    // Calculate accuracy for each category
    for (const category of Object.keys(categories)) {
      const cat = categories[category];
      cat.accuracy = cat.total > 0 
        ? (cat.passed / cat.total) * 100 
        : 0;
    }
    
    return categories;
  }

  calculatePerformanceMetrics() {
    const durations = this.results
      .filter(r => r.duration && !r.error)
      .map(r => r.duration);
    
    if (durations.length === 0) {
      return null;
    }
    
    durations.sort((a, b) => a - b);
    
    return {
      min: durations[0],
      max: durations[durations.length - 1],
      mean: durations.reduce((a, b) => a + b, 0) / durations.length,
      median: durations[Math.floor(durations.length / 2)],
      p95: durations[Math.floor(durations.length * 0.95)],
      p99: durations[Math.floor(durations.length * 0.99)]
    };
  }

  async abort() {
    this.running = false;
    this.emit('abort');
  }

  getProgress() {
    return {
      completed: this.stats.completed,
      total: this.stats.total,
      percentage: this.stats.total > 0 
        ? (this.stats.completed / this.stats.total) * 100 
        : 0,
      elapsed: this.startTime 
        ? (performance.now() - this.startTime) / 1000 
        : 0
    };
  }
}

// Test executor factory
export function createTestExecutor(scenario, client) {
  return {
    id: scenario.id,
    name: scenario.name,
    expectedOutcome: scenario.expectedOutcome,
    expectedFailureType: scenario.expectedFailureType,
    expectedCost: scenario.expectedCost,
    expectedDuration: scenario.expectedDuration,
    
    async execute(testClient) {
      const client = testClient || client;
      
      // Execute the test based on scenario type
      if (scenario.query) {
        return await client.executeBigQuery(
          scenario.query,
          scenario.params || {}
        );
      } else if (scenario.tool) {
        return await client.callTool(
          scenario.tool,
          scenario.args || {}
        );
      } else {
        throw new Error('Invalid test scenario - no query or tool specified');
      }
    },
    
    evaluate(result) {
      // Custom evaluation logic
      if (scenario.expectedOutcome === 'failure') {
        // Check if failure was predicted
        const predicted = result.prediction?.blocked || 
                         result.prediction?.successProbability < 0.5;
        
        // Check if correct failure type was identified
        if (predicted && scenario.expectedFailureType) {
          const typeMatches = this.checkFailureType(
            result.prediction,
            scenario.expectedFailureType
          );
          return typeMatches;
        }
        
        return predicted;
      } else {
        // Success case - should not be blocked
        return !result.prediction?.blocked && 
               (!result.prediction || result.prediction.successProbability >= 0.5);
      }
    },
    
    checkFailureType(prediction, expectedType) {
      if (!prediction) return false;
      
      switch (expectedType) {
        case 'syntax':
          // Check for syntax-related warnings
          return prediction.warnings?.some(w => 
            w.toLowerCase().includes('syntax') ||
            w.toLowerCase().includes('missing') ||
            w.toLowerCase().includes('invalid')
          );
          
        case 'permission':
          return prediction.warnings?.some(w => 
            w.toLowerCase().includes('permission') ||
            w.toLowerCase().includes('access') ||
            w.toLowerCase().includes('unauthorized')
          );
          
        case 'cost':
          return prediction.estimatedCost > 10 ||
                 prediction.warnings?.some(w => 
                   w.toLowerCase().includes('cost') ||
                   w.toLowerCase().includes('expensive')
                 );
                 
        case 'performance':
          return prediction.warnings?.some(w => 
            w.toLowerCase().includes('performance') ||
            w.toLowerCase().includes('slow') ||
            w.toLowerCase().includes('cross-region')
          );
          
        default:
          return true;
      }
    }
  };
}

export default TestOrchestrator;