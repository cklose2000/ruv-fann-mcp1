#!/usr/bin/env node

/**
 * End-to-End Integration Test for ruv-FANN MCP
 * 
 * Validates the complete system from MCP client through predictions
 * to actual BigQuery operations.
 */

import { spawn } from 'child_process';
import axios from 'axios';
import MCPTestClient from './mcp-test-client.js';
import TestOrchestrator, { createTestExecutor } from '../utils/test-orchestrator.js';
import { ALL_SCENARIOS, calculateExpectedMetrics } from '../scenarios/bigquery-test-scenarios.js';

class EndToEndTest {
  constructor() {
    this.services = {
      core: null,
      swarm: null,
      model: null,
      gcpBackend: null
    };
    
    this.clients = {
      mcp: null,
      core: axios.create({ baseURL: 'http://127.0.0.1:8090' }),
      swarm: axios.create({ baseURL: 'http://127.0.0.1:8081' }),
      model: axios.create({ baseURL: 'http://127.0.0.1:8082' })
    };
    
    this.orchestrator = new TestOrchestrator({
      concurrency: 5,
      timeout: 30000,
      retries: 2
    });
    
    this.setupOrchestratorListeners();
  }

  setupOrchestratorListeners() {
    this.orchestrator.on('start', (data) => {
      console.log(`\n🚀 Starting E2E tests: ${data.totalTests} scenarios, ${data.concurrency} workers`);
    });
    
    this.orchestrator.on('testStart', ({ test, workerId }) => {
      console.log(`[Worker ${workerId}] Testing: ${test.name}`);
    });
    
    this.orchestrator.on('testComplete', ({ test, progress }) => {
      const status = test.passed ? '✅' : '❌';
      console.log(`${status} ${test.name} (${test.duration.toFixed(0)}ms) - ${progress.toFixed(1)}% complete`);
    });
    
    this.orchestrator.on('testError', ({ test, workerId }) => {
      console.error(`[Worker ${workerId}] ❌ Error in ${test.name}: ${test.error}`);
    });
    
    this.orchestrator.on('complete', (summary) => {
      console.log('\n' + '='.repeat(80));
      console.log('E2E TEST SUMMARY');
      console.log('='.repeat(80));
    });
  }

  async startServices() {
    console.log('🔧 Starting backend services...\n');
    
    // Start Core Neural Network Service
    console.log('Starting Core Service (port 8090)...');
    this.services.core = spawn('./target/release/ruv-fann-core', [], {
      env: { ...process.env, PORT: '8090' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.setupServiceLogging('Core', this.services.core);
    await this.waitForService('core', 'http://127.0.0.1:8090/health');
    
    // Start Swarm Service
    console.log('Starting Swarm Service (port 8081)...');
    this.services.swarm = spawn('./target/release/ruv-swarm', ['--minimal', '--agents', '2'], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.setupServiceLogging('Swarm', this.services.swarm);
    await this.waitForService('swarm', 'http://127.0.0.1:8081/health');
    
    // Start Model Service
    console.log('Starting Model Service (port 8082)...');
    this.services.model = spawn('./target/release/model-server', [], {
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.setupServiceLogging('Model', this.services.model);
    await this.waitForService('model', 'http://127.0.0.1:8082/health');
    
    // Start Mock GCP Backend (for testing without real BigQuery)
    console.log('Starting Mock GCP Backend (port 8080)...');
    this.services.gcpBackend = spawn('node', ['../mock-gcp-backend.js'], {
      env: { ...process.env, PORT: '8080' },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    this.setupServiceLogging('GCP Backend', this.services.gcpBackend);
    await this.waitForService('gcpBackend', 'http://127.0.0.1:8080/mcp');
    
    console.log('\n✅ All services started successfully!\n');
  }

  setupServiceLogging(name, service) {
    service.stdout.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => console.log(`[${name}] ${line}`));
    });
    
    service.stderr.on('data', (data) => {
      const lines = data.toString().split('\n').filter(line => line.trim());
      lines.forEach(line => console.error(`[${name} ERROR] ${line}`));
    });
    
    service.on('exit', (code) => {
      console.log(`[${name}] Process exited with code ${code}`);
    });
  }

  async waitForService(name, healthUrl, maxRetries = 50) {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await axios.get(healthUrl);
        console.log(`✅ ${name} service is ready`);
        return;
      } catch (error) {
        if (i === maxRetries - 1) {
          throw new Error(`${name} service failed to start after ${maxRetries} attempts`);
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }
  }

  async connectMCPClient() {
    console.log('🔌 Connecting MCP test client...');
    
    this.clients.mcp = new MCPTestClient({
      env: {
        RUV_FANN_CORE_URL: 'http://127.0.0.1:8090',
        RUV_FANN_SWARM_URL: 'http://127.0.0.1:8081',
        RUV_FANN_MODEL_URL: 'http://127.0.0.1:8082',
        GCP_MCP_BACKEND_URL: 'http://127.0.0.1:8080'
      }
    });
    
    await this.clients.mcp.connect();
    console.log('✅ MCP client connected\n');
    
    // Verify tools are available
    const tools = await this.clients.mcp.listTools();
    console.log(`Available tools: ${tools.length}`);
    console.log(`BigQuery tools: ${tools.filter(t => t.name.includes('bq') || t.name.includes('gcp-sql')).length}`);
    console.log(`Intelligence tools: ${tools.filter(t => ['predict_outcome', 'learn_pattern', 'get_suggestions'].includes(t.name)).length}\n`);
  }

  async runTests() {
    const expectedMetrics = calculateExpectedMetrics();
    
    console.log('📊 Expected Metrics:');
    console.log(`- Total scenarios: ${expectedMetrics.totalScenarios}`);
    console.log(`- Failure scenarios: ${expectedMetrics.failureScenarios}`);
    console.log(`- Success scenarios: ${expectedMetrics.successScenarios}`);
    console.log(`- Expected accuracy: ${(expectedMetrics.expectedAccuracy * 100).toFixed(1)}%`);
    console.log(`- Total time waste prevented: ${expectedMetrics.totalTimeWasted} minutes`);
    console.log(`- Total cost risk: $${expectedMetrics.totalCostRisk}`);
    
    // Create test executors
    const tests = ALL_SCENARIOS.map(scenario => 
      createTestExecutor(scenario, this.clients.mcp)
    );
    
    // Run all tests
    const summary = await this.orchestrator.run(tests);
    
    return summary;
  }

  displayResults(summary) {
    console.log(`\nTest Duration: ${summary.duration.toFixed(2)} seconds`);
    console.log(`Total Tests: ${summary.stats.total}`);
    console.log(`Passed: ${summary.stats.passed} (${summary.overallAccuracy.toFixed(1)}%)`);
    console.log(`Failed: ${summary.stats.failed}`);
    console.log(`Errors: ${summary.stats.errors}`);
    console.log(`Timeouts: ${summary.stats.timeouts}`);
    console.log(`Retried: ${summary.stats.retried}`);
    
    console.log('\n📊 Accuracy by Category:');
    for (const [category, stats] of Object.entries(summary.accuracyByCategory)) {
      console.log(`- ${category}: ${stats.accuracy.toFixed(1)}% (${stats.passed}/${stats.total})`);
    }
    
    if (summary.performance) {
      console.log('\n⚡ Performance Metrics (ms):');
      console.log(`- Min: ${summary.performance.min.toFixed(0)}`);
      console.log(`- Mean: ${summary.performance.mean.toFixed(0)}`);
      console.log(`- Median: ${summary.performance.median.toFixed(0)}`);
      console.log(`- P95: ${summary.performance.p95.toFixed(0)}`);
      console.log(`- P99: ${summary.performance.p99.toFixed(0)}`);
      console.log(`- Max: ${summary.performance.max.toFixed(0)}`);
    }
    
    // Business metrics
    const failurePrevented = summary.results.filter(r => 
      r.expected.outcome === 'failure' && r.passed
    ).length;
    
    const costPrevented = summary.results
      .filter(r => r.expected.outcome === 'failure' && r.passed && r.expected.cost)
      .reduce((sum, r) => sum + r.expected.cost, 0);
    
    const timeSaved = summary.results
      .filter(r => r.expected.outcome === 'failure' && r.passed)
      .reduce((sum, r) => sum + (r.expected.timeWasted || 0), 0);
    
    console.log('\n💰 Business Impact:');
    console.log(`- Failures prevented: ${failurePrevented}`);
    console.log(`- Cost prevented: $${costPrevented}`);
    console.log(`- Developer time saved: ${timeSaved} minutes`);
    
    // Validation
    const targetAccuracy = 73.3;
    const accuracyDiff = Math.abs(summary.overallAccuracy - targetAccuracy);
    
    console.log('\n🎯 Validation:');
    if (accuracyDiff <= 5) {
      console.log(`✅ Accuracy (${summary.overallAccuracy.toFixed(1)}%) meets target (${targetAccuracy}% ±5%)`);
    } else {
      console.log(`❌ Accuracy (${summary.overallAccuracy.toFixed(1)}%) misses target (${targetAccuracy}% ±5%)`);
    }
    
    // Check response times
    const avgResponseTime = summary.performance ? summary.performance.mean : 0;
    if (avgResponseTime < 50) {
      console.log(`✅ Average response time (${avgResponseTime.toFixed(0)}ms) meets <50ms target`);
    } else {
      console.log(`❌ Average response time (${avgResponseTime.toFixed(0)}ms) exceeds <50ms target`);
    }
    
    // Specific category checks
    const syntaxAccuracy = summary.accuracyByCategory.syntax?.accuracy || 0;
    const permissionAccuracy = summary.accuracyByCategory.permission?.accuracy || 0;
    
    if (syntaxAccuracy >= 90) {
      console.log(`✅ Syntax error detection (${syntaxAccuracy.toFixed(1)}%) meets 90%+ target`);
    } else {
      console.log(`❌ Syntax error detection (${syntaxAccuracy.toFixed(1)}%) below 90% target`);
    }
    
    if (permissionAccuracy >= 90) {
      console.log(`✅ Permission error detection (${permissionAccuracy.toFixed(1)}%) meets 90%+ target`);
    } else {
      console.log(`❌ Permission error detection (${permissionAccuracy.toFixed(1)}%) below 90% target`);
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    // Disconnect MCP client
    if (this.clients.mcp) {
      await this.clients.mcp.disconnect();
    }
    
    // Stop all services
    for (const [name, service] of Object.entries(this.services)) {
      if (service) {
        console.log(`Stopping ${name} service...`);
        service.kill();
      }
    }
    
    console.log('✅ Cleanup complete');
  }

  async run() {
    try {
      await this.startServices();
      await this.connectMCPClient();
      
      const summary = await this.runTests();
      this.displayResults(summary);
      
      // Save results
      await this.saveResults(summary);
      
    } catch (error) {
      console.error('\n❌ E2E Test Failed:', error.message);
      console.error(error.stack);
      process.exit(1);
    } finally {
      await this.cleanup();
    }
  }

  async saveResults(summary) {
    const fs = await import('fs/promises');
    const timestamp = new Date().toISOString().replace(/:/g, '-');
    const filename = `e2e-test-results-${timestamp}.json`;
    
    await fs.writeFile(
      `./test-results/${filename}`,
      JSON.stringify(summary, null, 2)
    );
    
    console.log(`\n📁 Results saved to: test-results/${filename}`);
  }
}

// Run the test
if (import.meta.url === `file://${process.argv[1]}`) {
  const test = new EndToEndTest();
  test.run();
}

export default EndToEndTest;