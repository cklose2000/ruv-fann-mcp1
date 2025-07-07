import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});
import { TrainingDataGenerator, TrainingPattern } from './training-data-generator.js';
import { SQLAnalyzer } from '../analyzers/sql-analyzer.js';
import axios from 'axios';

/**
 * Training Configuration
 */
export interface TrainingConfig {
  ruvFannCoreUrl: string;
  epochs: number;
  batchSize: number;
  learningRate: number;
  validationSplit: number;
  targetAccuracy: number;
}

/**
 * Training Result
 */
export interface TrainingResult {
  success: boolean;
  finalAccuracy: number;
  epochs: number;
  trainingLoss: number[];
  validationAccuracy: number[];
  errorMessage?: string;
}

/**
 * Neural Network Trainer for BigQuery Failure Prediction
 */
export class NeuralNetworkTrainer {
  private readonly logger = logger.child({ component: 'NeuralNetworkTrainer' });
  private trainingDataGenerator: TrainingDataGenerator;
  private sqlAnalyzer: SQLAnalyzer;
  private coreClient;

  constructor(config: TrainingConfig) {
    this.trainingDataGenerator = new TrainingDataGenerator();
    this.sqlAnalyzer = new SQLAnalyzer();
    this.coreClient = axios.create({
      baseURL: config.ruvFannCoreUrl,
      timeout: 30000,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  /**
   * Train the neural network with BigQuery failure patterns
   */
  public async trainNetwork(config: TrainingConfig): Promise<TrainingResult> {
    this.logger.info('Starting neural network training', { 
      epochs: config.epochs,
      targetAccuracy: config.targetAccuracy 
    });

    try {
      // Step 1: Generate comprehensive training data
      const allPatterns = this.trainingDataGenerator.generateTrainingData();
      this.logger.info('Generated training data', { 
        totalPatterns: allPatterns.length,
        categories: this.getPatternCategoryCounts(allPatterns)
      });

      // Step 2: Convert patterns to neural network format
      const { inputs, targets } = this.prepareBatchTrainingData(allPatterns);
      this.logger.info('Prepared training data', { 
        inputShape: `${inputs.length}x${inputs[0].length}`,
        targetShape: `${targets.length}x${targets[0].length}`
      });

      // Step 3: Split data for training and validation
      const { trainInputs, trainTargets, valInputs, valTargets } = 
        this.splitTrainingData(inputs, targets, config.validationSplit);

      this.logger.info('Split training data', {
        trainingSamples: trainInputs.length,
        validationSamples: valInputs.length
      });

      // Step 4: Create neural network if needed
      await this.ensureNetworkExists();

      // Step 5: Batch training with validation
      const result = await this.performBatchTraining(
        trainInputs,
        trainTargets,
        valInputs,
        valTargets,
        config
      );

      this.logger.info('Training completed', { 
        success: result.success,
        finalAccuracy: result.finalAccuracy,
        epochs: result.epochs
      });

      return result;

    } catch (error: any) {
      this.logger.error('Training failed', { error: error.message });
      return {
        success: false,
        finalAccuracy: 0,
        epochs: 0,
        trainingLoss: [],
        validationAccuracy: [],
        errorMessage: error.message
      };
    }
  }

  /**
   * Evaluate network performance on test patterns
   */
  public async evaluateNetwork(testPatterns: TrainingPattern[]): Promise<{ accuracy: number; categoryAccuracies: any }> {
    this.logger.info('Evaluating network performance', { testPatterns: testPatterns.length });

    const results = {
      totalCorrect: 0,
      totalSamples: testPatterns.length,
      categoryResults: {} as any
    };

    // Initialize category tracking
    const categories = ['syntax', 'permission', 'cost', 'performance', 'region', 'success'];
    categories.forEach(category => {
      results.categoryResults[category] = { correct: 0, total: 0 };
    });

    // Test each pattern
    for (const pattern of testPatterns) {
      try {
        // Make prediction
        const response = await this.coreClient.post('/api/network/predict', {
          input: pattern.features
        });

        const prediction = response.data.output;
        const isCorrect = this.evaluatePrediction(prediction, pattern.targets);
        
        if (isCorrect) {
          results.totalCorrect++;
        }

        // Track by category
        const category = pattern.failureType || 'success';
        results.categoryResults[category].total++;
        if (isCorrect) {
          results.categoryResults[category].correct++;
        }

      } catch (error: any) {
        this.logger.warn('Prediction failed during evaluation', { 
          patternId: pattern.id,
          error: error.message 
        });
      }
    }

    // Calculate accuracies
    const overallAccuracy = results.totalCorrect / results.totalSamples;
    const categoryAccuracies: any = {};
    
    Object.keys(results.categoryResults).forEach(category => {
      const { correct, total } = results.categoryResults[category];
      categoryAccuracies[category] = total > 0 ? correct / total : 0;
    });

    this.logger.info('Evaluation complete', {
      overallAccuracy: overallAccuracy.toFixed(3),
      categoryAccuracies: Object.keys(categoryAccuracies).map(cat => 
        `${cat}: ${(categoryAccuracies[cat] * 100).toFixed(1)}%`
      ).join(', ')
    });

    return { accuracy: overallAccuracy, categoryAccuracies };
  }

  /**
   * Quick training with pre-generated patterns for testing
   */
  public async quickTrain(): Promise<TrainingResult> {
    return this.trainNetwork({
      ruvFannCoreUrl: 'http://127.0.0.1:8090',
      epochs: 50,
      batchSize: 10,
      learningRate: 0.1,
      validationSplit: 0.2,
      targetAccuracy: 0.75
    });
  }

  private prepareBatchTrainingData(patterns: TrainingPattern[]): { inputs: number[][], targets: number[][] } {
    const inputs: number[][] = [];
    const targets: number[][] = [];

    patterns.forEach(pattern => {
      // Use pre-computed features or generate them
      if (pattern.features && pattern.features.length === 10) {
        inputs.push([...pattern.features]);
      } else {
        // Generate features from SQL analysis
        const sqlAnalysis = this.sqlAnalyzer.analyzeQuery(pattern.query, pattern.params);
        const features = this.trainingDataGenerator.queryToFeatures(pattern.query, pattern.params, sqlAnalysis);
        inputs.push(features);
      }

      // Use pre-computed targets or generate them
      if (pattern.targets && pattern.targets.length === 4) {
        targets.push([...pattern.targets]);
      } else {
        const generatedTargets = this.trainingDataGenerator.generateTargets(pattern);
        targets.push(generatedTargets);
      }
    });

    return { inputs, targets };
  }

  private splitTrainingData(
    inputs: number[][],
    targets: number[][],
    validationSplit: number
  ): { trainInputs: number[][], trainTargets: number[][], valInputs: number[][], valTargets: number[][] } {
    const splitIndex = Math.floor(inputs.length * (1 - validationSplit));
    
    // Shuffle data before splitting
    const shuffled = this.shuffleData(inputs, targets);
    
    return {
      trainInputs: shuffled.inputs.slice(0, splitIndex),
      trainTargets: shuffled.targets.slice(0, splitIndex),
      valInputs: shuffled.inputs.slice(splitIndex),
      valTargets: shuffled.targets.slice(splitIndex)
    };
  }

  private shuffleData(inputs: number[][], targets: number[][]): { inputs: number[][], targets: number[][] } {
    const indices = Array.from({ length: inputs.length }, (_, i) => i);
    
    // Fisher-Yates shuffle
    for (let i = indices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [indices[i], indices[j]] = [indices[j], indices[i]];
    }
    
    return {
      inputs: indices.map(i => inputs[i]),
      targets: indices.map(i => targets[i])
    };
  }

  private async ensureNetworkExists(): Promise<void> {
    try {
      // Check if network exists
      await this.coreClient.get('/api/network/info');
      this.logger.info('Neural network already exists');
    } catch (error) {
      // Create new network
      this.logger.info('Creating new neural network');
      await this.coreClient.post('/api/network/create', {
        layers: [10, 8, 4], // 10 inputs, 8 hidden, 4 outputs
        learning_rate: 0.1
      });
      this.logger.info('Neural network created successfully');
    }
  }

  private async performBatchTraining(
    trainInputs: number[][],
    trainTargets: number[][],
    valInputs: number[][],
    valTargets: number[][],
    config: TrainingConfig
  ): Promise<TrainingResult> {
    const trainingLoss: number[] = [];
    const validationAccuracy: number[] = [];
    let bestAccuracy = 0;
    let epochsSinceImprovement = 0;
    const maxEpochsWithoutImprovement = 10;

    for (let epoch = 0; epoch < config.epochs; epoch++) {
      try {
        // Training phase
        const batchLosses: number[] = [];
        
        for (let i = 0; i < trainInputs.length; i += config.batchSize) {
          const batchInputs = trainInputs.slice(i, i + config.batchSize);
          const batchTargets = trainTargets.slice(i, i + config.batchSize);
          
          const trainResponse = await this.coreClient.post('/api/network/train', {
            inputs: batchInputs,
            targets: batchTargets,
            epochs: 1
          });
          
          if (trainResponse.data.losses && trainResponse.data.losses.length > 0) {
            batchLosses.push(trainResponse.data.losses[trainResponse.data.losses.length - 1]);
          }
        }

        // Calculate average loss for this epoch
        const avgLoss = batchLosses.reduce((sum, loss) => sum + loss, 0) / batchLosses.length;
        trainingLoss.push(avgLoss);

        // Validation phase
        const valAccuracy = await this.validateNetwork(valInputs, valTargets);
        validationAccuracy.push(valAccuracy);

        this.logger.debug(`Epoch ${epoch + 1}/${config.epochs}`, {
          loss: avgLoss.toFixed(4),
          valAccuracy: (valAccuracy * 100).toFixed(1) + '%'
        });

        // Check for improvement
        if (valAccuracy > bestAccuracy) {
          bestAccuracy = valAccuracy;
          epochsSinceImprovement = 0;
          
          // Check if we've reached target accuracy
          if (valAccuracy >= config.targetAccuracy) {
            this.logger.info(`Target accuracy ${config.targetAccuracy} reached at epoch ${epoch + 1}`);
            return {
              success: true,
              finalAccuracy: valAccuracy,
              epochs: epoch + 1,
              trainingLoss,
              validationAccuracy
            };
          }
        } else {
          epochsSinceImprovement++;
        }

        // Early stopping
        if (epochsSinceImprovement >= maxEpochsWithoutImprovement) {
          this.logger.info(`Early stopping at epoch ${epoch + 1} (no improvement for ${maxEpochsWithoutImprovement} epochs)`);
          break;
        }

      } catch (error: any) {
        this.logger.error(`Training failed at epoch ${epoch + 1}`, { error: error.message });
        throw error;
      }
    }

    return {
      success: bestAccuracy >= config.targetAccuracy,
      finalAccuracy: bestAccuracy,
      epochs: trainingLoss.length,
      trainingLoss,
      validationAccuracy
    };
  }

  private async validateNetwork(valInputs: number[][], valTargets: number[][]): Promise<number> {
    let correctPredictions = 0;

    for (let i = 0; i < valInputs.length; i++) {
      try {
        const response = await this.coreClient.post('/api/network/predict', {
          input: valInputs[i]
        });

        const prediction = response.data.output;
        const isCorrect = this.evaluatePrediction(prediction, valTargets[i]);
        
        if (isCorrect) {
          correctPredictions++;
        }
      } catch (error: any) {
        // Skip failed predictions
        this.logger.debug('Validation prediction failed', { error: error.message });
      }
    }

    return correctPredictions / valInputs.length;
  }

  private evaluatePrediction(prediction: number[], target: number[]): boolean {
    // Evaluate based on the type of prediction
    
    // Success probability (index 0): threshold-based evaluation
    const predictedSuccess = prediction[0] > 0.5;
    const actualSuccess = target[0] > 0.5;
    
    if (predictedSuccess === actualSuccess) {
      return true;
    }

    // For failures, check if we predicted the right type of failure
    if (!actualSuccess) {
      // Find the predicted failure type (max of indices 1-3)
      const predictedFailureType = prediction.slice(1).indexOf(Math.max(...prediction.slice(1))) + 1;
      const actualFailureType = target.slice(1).indexOf(Math.max(...target.slice(1))) + 1;
      
      return predictedFailureType === actualFailureType;
    }

    return false;
  }

  private getPatternCategoryCounts(patterns: TrainingPattern[]): any {
    const counts: any = {};
    patterns.forEach(pattern => {
      const category = pattern.failureType || 'success';
      counts[category] = (counts[category] || 0) + 1;
    });
    return counts;
  }
}