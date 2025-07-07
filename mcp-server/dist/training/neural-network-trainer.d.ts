import { TrainingPattern } from './training-data-generator.js';
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
export declare class NeuralNetworkTrainer {
    private readonly logger;
    private trainingDataGenerator;
    private sqlAnalyzer;
    private coreClient;
    constructor(config: TrainingConfig);
    /**
     * Train the neural network with BigQuery failure patterns
     */
    trainNetwork(config: TrainingConfig): Promise<TrainingResult>;
    /**
     * Evaluate network performance on test patterns
     */
    evaluateNetwork(testPatterns: TrainingPattern[]): Promise<{
        accuracy: number;
        categoryAccuracies: any;
    }>;
    /**
     * Quick training with pre-generated patterns for testing
     */
    quickTrain(): Promise<TrainingResult>;
    private prepareBatchTrainingData;
    private splitTrainingData;
    private shuffleData;
    private ensureNetworkExists;
    private performBatchTraining;
    private validateNetwork;
    private evaluatePrediction;
    private getPatternCategoryCounts;
}
//# sourceMappingURL=neural-network-trainer.d.ts.map