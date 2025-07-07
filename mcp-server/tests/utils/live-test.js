#!/usr/bin/env node

/**
 * Simple live test for metrics dashboard
 * Runs a quick prediction test to verify system is working
 */
import { GCPPredictor } from '../../dist/predictors/gcp-predictor.js';
import { GCPPatternStorage } from '../../dist/storage/gcp-pattern-storage.js';
import { RuvFannClient } from '../../dist/clients/ruv-fann-client.js';

async function runLiveTest() {
  try {
    // Initialize components with test database
    const patternStorage = new GCPPatternStorage(':memory:'); // In-memory for speed
    const ruvFannClient = new RuvFannClient({
      coreUrl: process.env.RUV_FANN_CORE_URL || 'http://localhost:8090',
      swarmUrl: process.env.RUV_FANN_SWARM_URL || 'http://localhost:8081',
      modelUrl: process.env.RUV_FANN_MODEL_URL || 'http://localhost:8082',
    });
    
    const predictor = new GCPPredictor(ruvFannClient, patternStorage);
    
    // Run a simple prediction
    const startTime = Date.now();
    const prediction = await predictor.predictGCPOperation(
      'bq-query',
      { query: 'SELECT COUNT(*) FROM test_table' },
      { timestamp: Date.now() }
    );
    
    const duration = Date.now() - startTime;
    
    // Verify prediction has expected structure
    if (!prediction || 
        typeof prediction.successProbability !== 'number' ||
        typeof prediction.confidence !== 'number') {
      throw new Error('Invalid prediction structure');
    }
    
    // Log result for debugging
    console.log(JSON.stringify({
      success: true,
      duration,
      prediction: {
        successProbability: prediction.successProbability,
        confidence: prediction.confidence,
        warningCount: prediction.warnings?.length || 0,
      },
    }));
    
    process.exit(0);
  } catch (error) {
    console.error(JSON.stringify({
      success: false,
      error: error.message,
    }));
    process.exit(1);
  }
}

// Run with timeout
const timeout = setTimeout(() => {
  console.error('Live test timeout');
  process.exit(2);
}, 10000); // 10 second timeout

runLiveTest().then(() => {
  clearTimeout(timeout);
}).catch(error => {
  clearTimeout(timeout);
  console.error('Live test failed:', error);
  process.exit(1);
});