import { SQLAnalysisResult } from '../analyzers/sql-analyzer.js';
/**
 * Training Pattern for Neural Network
 */
export interface TrainingPattern {
    id: string;
    scenario: string;
    query: string;
    params: any;
    expectedOutcome: 'success' | 'failure';
    expectedError?: string;
    expectedCost?: number;
    expectedDuration?: number;
    failureType?: 'syntax' | 'permission' | 'cost' | 'performance' | 'region';
    features: number[];
    targets: number[];
}
/**
 * Training Data Generator for BigQuery Failure Patterns
 */
export declare class TrainingDataGenerator {
    private readonly logger;
    /**
     * Generate comprehensive training dataset
     */
    generateTrainingData(): TrainingPattern[];
    private generateSyntaxErrorPatterns;
    private generatePermissionErrorPatterns;
    private generateCostOverrunPatterns;
    private generatePerformanceIssuePatterns;
    private generateCrossRegionPatterns;
    private generateSuccessPatterns;
    private generateMoreSyntaxPatterns;
    private generateMorePermissionPatterns;
    private generateMoreCostPatterns;
    private generateMorePerformancePatterns;
    private generateMoreRegionPatterns;
    private generateMoreSuccessPatterns;
    /**
     * Convert SQL query to feature vector using intelligent extraction
     */
    queryToFeatures(query: string, params: any, sqlAnalysis: SQLAnalysisResult): number[];
    /**
     * Generate targets for training based on expected outcome
     */
    generateTargets(pattern: Omit<TrainingPattern, 'features' | 'targets'>): number[];
}
//# sourceMappingURL=training-data-generator.d.ts.map