#!/usr/bin/env node

/**
 * Neural Network Training Script for BigQuery Failure Prediction
 * 
 * This script trains the ruv-FANN neural network with comprehensive
 * BigQuery failure patterns to improve prediction accuracy.
 */

import { NeuralNetworkTrainer } from './dist/training/neural-network-trainer.js';
import { TrainingDataGenerator } from './dist/training/training-data-generator.js';

const CORE_URL = process.env.RUV_FANN_CORE_URL || 'http://127.0.0.1:8090';

async function main() {
  console.log('🚀 Starting ruv-FANN Neural Network Training...\n');

  // Training configuration
  const config = {
    ruvFannCoreUrl: CORE_URL,
    epochs: 100,
    batchSize: 10,
    learningRate: 0.1,
    validationSplit: 0.2,
    targetAccuracy: 0.75
  };

  console.log('📋 Training Configuration:');
  console.log(`   • Core URL: ${config.ruvFannCoreUrl}`);
  console.log(`   • Epochs: ${config.epochs}`);
  console.log(`   • Batch Size: ${config.batchSize}`);
  console.log(`   • Learning Rate: ${config.learningRate}`);
  console.log(`   • Validation Split: ${config.validationSplit * 100}%`);
  console.log(`   • Target Accuracy: ${config.targetAccuracy * 100}%\n`);

  try {
    // Initialize trainer
    const trainer = new NeuralNetworkTrainer(config);
    
    // Check connectivity to ruv-FANN core
    console.log('🔗 Checking connectivity to ruv-FANN core...');
    const axios = await import('axios');
    await axios.default.get(`${CORE_URL}/health`);
    console.log('   ✅ Connected to ruv-FANN core\n');

    // Generate and display training data statistics
    console.log('📊 Generating training data...');
    const dataGenerator = new TrainingDataGenerator();
    const patterns = dataGenerator.generateTrainingData();
    
    const stats = {
      total: patterns.length,
      syntax: patterns.filter(p => p.failureType === 'syntax').length,
      permission: patterns.filter(p => p.failureType === 'permission').length,
      cost: patterns.filter(p => p.failureType === 'cost').length,
      performance: patterns.filter(p => p.failureType === 'performance').length,
      region: patterns.filter(p => p.failureType === 'region').length,
      success: patterns.filter(p => p.expectedOutcome === 'success').length
    };
    
    console.log('   📈 Training Data Statistics:');
    console.log(`      • Total Patterns: ${stats.total}`);
    console.log(`      • Syntax Errors: ${stats.syntax}`);
    console.log(`      • Permission Errors: ${stats.permission}`);
    console.log(`      • Cost Overruns: ${stats.cost}`);
    console.log(`      • Performance Issues: ${stats.performance}`);
    console.log(`      • Cross-Region Queries: ${stats.region}`);
    console.log(`      • Success Cases: ${stats.success}\n`);

    // Start training
    console.log('🎯 Starting neural network training...');
    const startTime = Date.now();
    
    const result = await trainer.trainNetwork(config);
    
    const duration = (Date.now() - startTime) / 1000;
    
    // Display results
    console.log('\n📊 Training Results:');
    console.log(`   • Success: ${result.success ? '✅' : '❌'}`);
    console.log(`   • Final Accuracy: ${(result.finalAccuracy * 100).toFixed(1)}%`);
    console.log(`   • Epochs Completed: ${result.epochs}`);
    console.log(`   • Training Duration: ${duration.toFixed(1)}s`);
    
    if (result.trainingLoss.length > 0) {
      const finalLoss = result.trainingLoss[result.trainingLoss.length - 1];
      console.log(`   • Final Loss: ${finalLoss.toFixed(4)}`);
    }
    
    if (result.success) {
      console.log(`   🎉 Target accuracy of ${config.targetAccuracy * 100}% achieved!\n`);
    } else {
      console.log(`   ⚠️  Target accuracy not reached. Best: ${(result.finalAccuracy * 100).toFixed(1)}%\n`);
    }

    // Evaluation on test data
    console.log('🧪 Evaluating network performance...');
    const testPatterns = patterns.slice(-20); // Use last 20 patterns as test set
    const evaluation = await trainer.evaluateNetwork(testPatterns);
    
    console.log('   📊 Category-Specific Accuracies:');
    Object.keys(evaluation.categoryAccuracies).forEach(category => {
      const accuracy = (evaluation.categoryAccuracies[category] * 100).toFixed(1);
      console.log(`      • ${category}: ${accuracy}%`);
    });
    
    console.log(`\n   🎯 Overall Test Accuracy: ${(evaluation.accuracy * 100).toFixed(1)}%`);

    // Final status
    if (result.success && evaluation.accuracy >= config.targetAccuracy) {
      console.log('\n🎉 SUCCESS: Neural network training completed successfully!');
      console.log('   The network is now ready for high-accuracy BigQuery failure prediction.');
      process.exit(0);
    } else {
      console.log('\n⚠️  WARNING: Training did not meet all target criteria.');
      console.log('   The network may need additional training or parameter tuning.');
      process.exit(1);
    }

  } catch (error) {
    console.error('\n❌ Training failed:', error.message);
    console.error('   Stack trace:', error.stack);
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Training interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Training terminated');
  process.exit(143);
});

// Run the training
main().catch(error => {
  console.error('❌ Unexpected error:', error);
  process.exit(1);
});