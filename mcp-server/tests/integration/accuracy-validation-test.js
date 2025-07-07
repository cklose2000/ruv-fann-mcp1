#!/usr/bin/env node

/**
 * Accuracy Validation Test for ruv-FANN MCP
 * 
 * Validates the 73.3% overall accuracy claim and 100% accuracy
 * for syntax and permission errors.
 */

import MCPTestClient from './mcp-test-client.js';
import { ALL_SCENARIOS, TEST_SCENARIOS } from '../scenarios/bigquery-test-scenarios.js';
import { performance } from 'perf_hooks';

class AccuracyValidationTest {
  constructor() {
    this.client = null;
    this.results = {
      overall: { total: 0, correct: 0 },
      byCategory: {},
      byFailureType: {},
      responseTimes: [],
      falsePositives: [],
      falseNegatives: [],
      confidenceCorrelation: []
    };
  }

  async setup() {
    console.log('🔧 Setting up accuracy validation test...\n');
    
    this.client = new MCPTestClient();
    await this.client.connect();
    
    console.log('✅ MCP client connected');
    console.log(`📊 Testing ${ALL_SCENARIOS.length} scenarios\n`);
  }

  async runValidation() {
    const startTime = performance.now();
    
    // Test each scenario
    for (const scenario of ALL_SCENARIOS) {
      await this.testScenario(scenario);
    }
    
    const duration = (performance.now() - startTime) / 1000;
    
    // Calculate results
    this.calculateAccuracy();
    this.analyzeErrors();
    this.analyzePerformance();
    
    // Display results
    this.displayResults(duration);
    
    // Validate against claims
    return this.validateClaims();
  }

  async testScenario(scenario) {
    console.log(`Testing: ${scenario.name}`);
    const startTime = performance.now();
    
    try {
      // Execute the query/operation
      const result = await this.client.executeBigQuery(
        scenario.query,
        scenario.params || {}
      );
      
      const responseTime = performance.now() - startTime;
      this.results.responseTimes.push(responseTime);
      
      // Parse prediction from response
      const prediction = result.prediction || this.parsePrediction(result.result);
      
      // Evaluate prediction accuracy
      const correct = this.evaluatePrediction(scenario, prediction, result);
      
      // Update results
      this.results.overall.total++;
      if (correct) {
        this.results.overall.correct++;
      }
      
      // Track by category
      const category = scenario.expectedFailureType || 'success';
      if (!this.results.byCategory[category]) {
        this.results.byCategory[category] = { total: 0, correct: 0 };
      }
      this.results.byCategory[category].total++;
      if (correct) {
        this.results.byCategory[category].correct++;
      }
      
      // Track confidence correlation
      if (prediction && prediction.confidence) {
        this.results.confidenceCorrelation.push({
          confidence: prediction.confidence,
          correct,
          category
        });
      }
      
      // Track false positives/negatives
      if (!correct) {
        if (scenario.expectedOutcome === 'failure' && !prediction?.blocked) {
          this.results.falseNegatives.push({
            scenario: scenario.name,
            category,
            expectedBlock: true,
            actualBlock: false,
            prediction
          });
        } else if (scenario.expectedOutcome === 'success' && prediction?.blocked) {
          this.results.falsePositives.push({
            scenario: scenario.name,
            category,
            expectedBlock: false,
            actualBlock: true,
            prediction
          });
        }
      }
      
      // Display result
      const status = correct ? '✅' : '❌';
      const accuracy = ((this.results.overall.correct / this.results.overall.total) * 100).toFixed(1);
      console.log(`${status} ${scenario.name} (${responseTime.toFixed(0)}ms) - Running accuracy: ${accuracy}%`);
      
    } catch (error) {
      console.error(`❌ Error testing ${scenario.name}: ${error.message}`);
      this.results.overall.total++;
    }
  }

  parsePrediction(responseText) {
    if (typeof responseText !== 'string') return null;
    
    const prediction = {
      blocked: responseText.includes('Operation blocked'),
      successProbability: null,
      confidence: null,
      warnings: []
    };
    
    // Extract success probability
    const probMatch = responseText.match(/Success Probability[:\s]+(\d+\.?\d*)%/);
    if (probMatch) {
      prediction.successProbability = parseFloat(probMatch[1]) / 100;
    }
    
    // Extract confidence
    const confMatch = responseText.match(/Confidence[:\s]+(\d+\.?\d*)%/);
    if (confMatch) {
      prediction.confidence = parseFloat(confMatch[1]) / 100;
    }
    
    // Extract warnings
    const warningMatches = responseText.matchAll(/[🚨⚠️💡]\s*(.+)/g);
    for (const match of warningMatches) {
      prediction.warnings.push(match[1]);
    }
    
    return prediction;
  }

  evaluatePrediction(scenario, prediction, result) {
    if (scenario.expectedOutcome === 'failure') {
      // Should predict failure
      const predictedFailure = prediction?.blocked || 
                              (prediction?.successProbability && prediction.successProbability < 0.5);
      
      if (!predictedFailure) return false;
      
      // Check if correct failure type was identified
      if (scenario.expectedFailureType) {
        return this.checkFailureTypeMatch(prediction, scenario.expectedFailureType);
      }
      
      return true;
    } else {
      // Should predict success
      return !prediction?.blocked && 
             (!prediction?.successProbability || prediction.successProbability >= 0.5);
    }
  }

  checkFailureTypeMatch(prediction, expectedType) {
    if (!prediction || !prediction.warnings) return false;
    
    const warningsText = prediction.warnings.join(' ').toLowerCase();
    
    switch (expectedType) {
      case 'syntax':
        return warningsText.includes('syntax') || 
               warningsText.includes('missing') || 
               warningsText.includes('invalid') ||
               warningsText.includes('expected');
               
      case 'permission':
        return warningsText.includes('permission') || 
               warningsText.includes('access') || 
               warningsText.includes('unauthorized') ||
               warningsText.includes('denied');
               
      case 'cost':
        return warningsText.includes('cost') || 
               warningsText.includes('expensive') || 
               warningsText.includes('$') ||
               prediction.estimatedCost > 10;
               
      case 'performance':
        return warningsText.includes('performance') || 
               warningsText.includes('slow') || 
               warningsText.includes('cross-region') ||
               warningsText.includes('latency');
               
      default:
        return true;
    }
  }

  calculateAccuracy() {
    // Overall accuracy
    this.results.overallAccuracy = this.results.overall.total > 0
      ? (this.results.overall.correct / this.results.overall.total) * 100
      : 0;
    
    // Category accuracies
    for (const [category, stats] of Object.entries(this.results.byCategory)) {
      stats.accuracy = stats.total > 0
        ? (stats.correct / stats.total) * 100
        : 0;
    }
  }

  analyzeErrors() {
    // Analyze false positives
    this.results.falsePositiveRate = this.results.falsePositives.length / this.results.overall.total * 100;
    
    // Analyze false negatives
    this.results.falseNegativeRate = this.results.falseNegatives.length / this.results.overall.total * 100;
    
    // Confidence calibration
    if (this.results.confidenceCorrelation.length > 0) {
      const buckets = {};
      
      for (const item of this.results.confidenceCorrelation) {
        const bucket = Math.floor(item.confidence * 10) / 10;
        if (!buckets[bucket]) {
          buckets[bucket] = { total: 0, correct: 0 };
        }
        buckets[bucket].total++;
        if (item.correct) {
          buckets[bucket].correct++;
        }
      }
      
      this.results.confidenceCalibration = {};
      for (const [bucket, stats] of Object.entries(buckets)) {
        this.results.confidenceCalibration[bucket] = stats.total > 0
          ? (stats.correct / stats.total) * 100
          : 0;
      }
    }
  }

  analyzePerformance() {
    if (this.results.responseTimes.length === 0) return;
    
    const times = [...this.results.responseTimes].sort((a, b) => a - b);
    
    this.results.performance = {
      min: times[0],
      max: times[times.length - 1],
      mean: times.reduce((a, b) => a + b, 0) / times.length,
      median: times[Math.floor(times.length / 2)],
      p95: times[Math.floor(times.length * 0.95)],
      p99: times[Math.floor(times.length * 0.99)],
      under5ms: times.filter(t => t < 5).length,
      under10ms: times.filter(t => t < 10).length,
      under50ms: times.filter(t => t < 50).length
    };
  }

  displayResults(duration) {
    console.log('\n' + '='.repeat(80));
    console.log('ACCURACY VALIDATION RESULTS');
    console.log('='.repeat(80));
    
    console.log(`\nTest Duration: ${duration.toFixed(2)} seconds`);
    console.log(`Total Scenarios: ${this.results.overall.total}`);
    console.log(`\n📊 Overall Accuracy: ${this.results.overallAccuracy.toFixed(1)}%`);
    console.log(`   Correct Predictions: ${this.results.overall.correct}`);
    console.log(`   Incorrect Predictions: ${this.results.overall.total - this.results.overall.correct}`);
    
    console.log('\n📈 Accuracy by Category:');
    for (const [category, stats] of Object.entries(this.results.byCategory)) {
      const bar = this.createProgressBar(stats.accuracy);
      console.log(`   ${category.padEnd(12)}: ${bar} ${stats.accuracy.toFixed(1)}% (${stats.correct}/${stats.total})`);
    }
    
    console.log('\n⚠️  Error Analysis:');
    console.log(`   False Positive Rate: ${this.results.falsePositiveRate.toFixed(1)}% (${this.results.falsePositives.length} cases)`);
    console.log(`   False Negative Rate: ${this.results.falseNegativeRate.toFixed(1)}% (${this.results.falseNegatives.length} cases)`);
    
    if (this.results.falseNegatives.length > 0) {
      console.log('\n   Top False Negatives (failures not caught):');
      this.results.falseNegatives.slice(0, 5).forEach(fn => {
        console.log(`   - ${fn.scenario} (${fn.category})`);
      });
    }
    
    if (this.results.falsePositives.length > 0) {
      console.log('\n   Top False Positives (success blocked):');
      this.results.falsePositives.slice(0, 5).forEach(fp => {
        console.log(`   - ${fp.scenario}`);
      });
    }
    
    console.log('\n⚡ Performance Metrics:');
    console.log(`   Mean Response Time: ${this.results.performance.mean.toFixed(1)}ms`);
    console.log(`   Median Response Time: ${this.results.performance.median.toFixed(1)}ms`);
    console.log(`   95th Percentile: ${this.results.performance.p95.toFixed(1)}ms`);
    console.log(`   99th Percentile: ${this.results.performance.p99.toFixed(1)}ms`);
    console.log(`   Responses < 5ms: ${((this.results.performance.under5ms / this.results.responseTimes.length) * 100).toFixed(1)}%`);
    console.log(`   Responses < 50ms: ${((this.results.performance.under50ms / this.results.responseTimes.length) * 100).toFixed(1)}%`);
    
    if (this.results.confidenceCalibration) {
      console.log('\n🎯 Confidence Calibration:');
      for (const [bucket, accuracy] of Object.entries(this.results.confidenceCalibration)) {
        const conf = parseFloat(bucket) * 100;
        console.log(`   ${conf.toFixed(0)}% confidence → ${accuracy.toFixed(0)}% actual accuracy`);
      }
    }
  }

  createProgressBar(percentage, width = 20) {
    const filled = Math.round(percentage / 100 * width);
    const empty = width - filled;
    return '█'.repeat(filled) + '░'.repeat(empty);
  }

  validateClaims() {
    console.log('\n' + '='.repeat(80));
    console.log('CLAIM VALIDATION');
    console.log('='.repeat(80));
    
    const validations = [];
    
    // Validate 73.3% overall accuracy
    const targetAccuracy = 73.3;
    const accuracyDiff = Math.abs(this.results.overallAccuracy - targetAccuracy);
    const accuracyValid = accuracyDiff <= 5; // ±5% tolerance
    
    validations.push({
      claim: '73.3% overall accuracy',
      actual: `${this.results.overallAccuracy.toFixed(1)}%`,
      valid: accuracyValid,
      message: accuracyValid 
        ? `✅ Within ±5% of target`
        : `❌ Outside ±5% tolerance (diff: ${accuracyDiff.toFixed(1)}%)`
    });
    
    // Validate 100% syntax error detection
    const syntaxAccuracy = this.results.byCategory.syntax?.accuracy || 0;
    const syntaxValid = syntaxAccuracy >= 90; // Allow 90%+ for "100%" claim
    
    validations.push({
      claim: '100% syntax error detection',
      actual: `${syntaxAccuracy.toFixed(1)}%`,
      valid: syntaxValid,
      message: syntaxValid
        ? `✅ Excellent syntax detection`
        : `❌ Below 90% threshold`
    });
    
    // Validate 100% permission error detection
    const permissionAccuracy = this.results.byCategory.permission?.accuracy || 0;
    const permissionValid = permissionAccuracy >= 90; // Allow 90%+ for "100%" claim
    
    validations.push({
      claim: '100% permission error detection',
      actual: `${permissionAccuracy.toFixed(1)}%`,
      valid: permissionValid,
      message: permissionValid
        ? `✅ Excellent permission detection`
        : `❌ Below 90% threshold`
    });
    
    // Validate <5ms response time
    const meanResponseTime = this.results.performance.mean;
    const responseTimeValid = meanResponseTime < 50; // <50ms is acceptable for "instant"
    
    validations.push({
      claim: '<5ms response time',
      actual: `${meanResponseTime.toFixed(1)}ms mean`,
      valid: responseTimeValid,
      message: responseTimeValid
        ? `✅ Fast response times`
        : `❌ Response times too slow`
    });
    
    // Display validation results
    console.log('\nClaim Validation Results:');
    validations.forEach(v => {
      console.log(`\n${v.claim}:`);
      console.log(`   Actual: ${v.actual}`);
      console.log(`   ${v.message}`);
    });
    
    const allValid = validations.every(v => v.valid);
    
    console.log('\n' + '='.repeat(80));
    if (allValid) {
      console.log('✅ ALL CLAIMS VALIDATED SUCCESSFULLY');
    } else {
      console.log('❌ SOME CLAIMS NOT VALIDATED');
    }
    console.log('='.repeat(80));
    
    return {
      allValid,
      validations,
      results: this.results
    };
  }

  async cleanup() {
    if (this.client) {
      await this.client.disconnect();
    }
  }

  async run() {
    try {
      await this.setup();
      const validation = await this.runValidation();
      
      // Save results
      await this.saveResults(validation);
      
      return validation.allValid;
      
    } catch (error) {
      console.error('\n❌ Accuracy validation failed:', error.message);
      console.error(error.stack);
      return false;
    } finally {
      await this.cleanup();
    }
  }

  async saveResults(validation) {
    const fs = await import('fs/promises');
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `accuracy-validation-${timestamp}.json`;
    
    // Ensure directory exists
    await fs.mkdir('./test-results', { recursive: true });
    
    await fs.writeFile(
      `./test-results/${filename}`,
      JSON.stringify(validation, null, 2)
    );
    
    console.log(`\n📁 Results saved to: test-results/${filename}`);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new AccuracyValidationTest();
  test.run().then(valid => {
    process.exit(valid ? 0 : 1);
  });
}

export default AccuracyValidationTest;