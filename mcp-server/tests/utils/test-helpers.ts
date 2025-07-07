import { TestPattern, TestResult, TestMetrics, BenchmarkResult } from '../types/test-types.js';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

export class TestHelpers {
  /**
   * Calculate accuracy metrics from test results
   */
  static calculateMetrics(results: TestResult[]): TestMetrics {
    const totalTests = results.length;
    if (totalTests === 0) {
      return {
        predictionAccuracy: 0,
        costEstimationError: 0,
        falsePositiveRate: 0,
        falseNegativeRate: 0,
        avgPredictionLatency: 0,
        patternMatchingSpeed: 0,
        learningEffectiveness: 0,
      };
    }

    // Calculate outcome accuracy
    const correctPredictions = results.filter(r => r.accuracy.outcomeCorrect).length;
    const predictionAccuracy = correctPredictions / totalTests;

    // Calculate false positive/negative rates
    const falsePositives = results.filter(r => 
      r.prediction.successProbability > 0.5 && r.actual.outcome === 'failure'
    ).length;
    const falseNegatives = results.filter(r => 
      r.prediction.successProbability <= 0.5 && r.actual.outcome === 'success'
    ).length;

    const actualPositives = results.filter(r => r.actual.outcome === 'success').length;
    const actualNegatives = results.filter(r => r.actual.outcome === 'failure').length;

    const falsePositiveRate = actualNegatives > 0 ? falsePositives / actualNegatives : 0;
    const falseNegativeRate = actualPositives > 0 ? falseNegatives / actualPositives : 0;

    // Calculate cost estimation error
    const costResults = results.filter(r => r.actual.cost !== undefined && r.prediction.estimatedCost !== undefined);
    const costEstimationError = costResults.length > 0
      ? costResults.reduce((sum, r) => sum + Math.abs(r.accuracy.costError || 0), 0) / costResults.length
      : 0;

    // Calculate average prediction latency (mock for now)
    const avgPredictionLatency = 50; // Will be measured in real tests

    return {
      predictionAccuracy,
      costEstimationError,
      falsePositiveRate,
      falseNegativeRate,
      avgPredictionLatency,
      patternMatchingSpeed: 25, // Mock value
      learningEffectiveness: predictionAccuracy * 0.9, // Simplified calculation
    };
  }

  /**
   * Generate a unique test run ID
   */
  static generateTestRunId(): string {
    return `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Create a temporary test database
   */
  static createTestDatabase(name: string): Database.Database {
    const testDbPath = path.join(process.cwd(), 'tests', 'fixtures', `${name}.db`);
    
    // Ensure directory exists
    const dir = path.dirname(testDbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Remove existing test database
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }

    return new Database(testDbPath);
  }

  /**
   * Clean up test databases
   */
  static cleanupTestDatabases(): void {
    const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');
    if (fs.existsSync(fixturesDir)) {
      const files = fs.readdirSync(fixturesDir);
      files.forEach(file => {
        if (file.endsWith('.db')) {
          fs.unlinkSync(path.join(fixturesDir, file));
        }
      });
    }
  }

  /**
   * Wait for a condition to be true
   */
  static async waitFor(
    condition: () => boolean | Promise<boolean>,
    timeout: number = 5000,
    interval: number = 100
  ): Promise<void> {
    const startTime = Date.now();
    
    while (Date.now() - startTime < timeout) {
      if (await condition()) {
        return;
      }
      await new Promise(resolve => setTimeout(resolve, interval));
    }
    
    throw new Error('Timeout waiting for condition');
  }

  /**
   * Mock HTTP responses for testing
   */
  static createMockResponse(data: any, status: number = 200): any {
    return {
      data,
      status,
      headers: {},
      config: {},
      statusText: 'OK',
    };
  }

  /**
   * Calculate percentile from array of numbers
   */
  static percentile(arr: number[], p: number): number {
    const sorted = arr.sort((a, b) => a - b);
    const index = Math.ceil((p / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Format duration for display
   */
  static formatDuration(ms: number): string {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
    return `${(ms / 60000).toFixed(2)}m`;
  }

  /**
   * Compare two objects for deep equality
   */
  static deepEqual(a: any, b: any): boolean {
    if (a === b) return true;
    if (a == null || b == null) return false;
    if (typeof a !== 'object' || typeof b !== 'object') return false;
    
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    
    if (keysA.length !== keysB.length) return false;
    
    for (const key of keysA) {
      if (!keysB.includes(key)) return false;
      if (!this.deepEqual(a[key], b[key])) return false;
    }
    
    return true;
  }

  /**
   * Create a mock GCP error response
   */
  static createGCPError(code: string, message: string): any {
    return {
      error: {
        code,
        message,
        status: this.getStatusFromCode(code),
      },
    };
  }

  private static getStatusFromCode(code: string): number {
    const codeMap: Record<string, number> = {
      'PERMISSION_DENIED': 403,
      'NOT_FOUND': 404,
      'INVALID_ARGUMENT': 400,
      'RESOURCE_EXHAUSTED': 429,
      'INTERNAL': 500,
      'UNAVAILABLE': 503,
      'DEADLINE_EXCEEDED': 504,
    };
    return codeMap[code] || 500;
  }
}

/**
 * Test data sanitizer
 */
export class TestDataSanitizer {
  static sanitize(data: any): any {
    if (typeof data !== 'object' || data === null) {
      return data;
    }

    const sanitized = Array.isArray(data) ? [...data] : { ...data };
    const sensitiveKeys = ['password', 'token', 'secret', 'key', 'credential'];

    for (const key in sanitized) {
      if (sensitiveKeys.some(sensitive => key.toLowerCase().includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof sanitized[key] === 'object') {
        sanitized[key] = this.sanitize(sanitized[key]);
      }
    }

    return sanitized;
  }
}

/**
 * Performance measurement utilities
 */
export class PerformanceTracker {
  private marks: Map<string, number> = new Map();
  private measures: Map<string, number[]> = new Map();

  mark(name: string): void {
    this.marks.set(name, performance.now());
  }

  measure(name: string, startMark: string, endMark?: string): number {
    const start = this.marks.get(startMark);
    if (!start) throw new Error(`Start mark '${startMark}' not found`);
    
    const end = endMark ? this.marks.get(endMark) : performance.now();
    if (endMark && !end) throw new Error(`End mark '${endMark}' not found`);
    
    const duration = (end || performance.now()) - start;
    
    if (!this.measures.has(name)) {
      this.measures.set(name, []);
    }
    this.measures.get(name)!.push(duration);
    
    return duration;
  }

  getStats(measureName: string): BenchmarkResult | null {
    const measures = this.measures.get(measureName);
    if (!measures || measures.length === 0) return null;

    const sorted = [...measures].sort((a, b) => a - b);
    
    return {
      operation: measureName,
      iterations: measures.length,
      avgDuration: measures.reduce((a, b) => a + b, 0) / measures.length,
      minDuration: sorted[0],
      maxDuration: sorted[sorted.length - 1],
      p95Duration: TestHelpers.percentile(sorted, 95),
      p99Duration: TestHelpers.percentile(sorted, 99),
      memoryUsage: {
        initial: 0, // Would be measured in real implementation
        peak: 0,
        final: 0,
      },
    };
  }

  clear(): void {
    this.marks.clear();
    this.measures.clear();
  }
}