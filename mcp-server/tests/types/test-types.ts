// Test types and interfaces

export interface TestPattern {
  scenario: string;
  tool: string;
  params: any;
  expectedOutcome: 'success' | 'failure';
  expectedError?: string;
  expectedCost?: number;
  expectedDuration?: number;
  expectedWarnings?: string[];
}

export interface TestMetrics {
  predictionAccuracy: number;
  costEstimationError: number;
  falsePositiveRate: number;
  falseNegativeRate: number;
  avgPredictionLatency: number;
  patternMatchingSpeed: number;
  learningEffectiveness: number;
}

export interface TestRun {
  id: string;
  timestamp: Date;
  suite: string;
  patterns: TestPattern[];
  results: TestResult[];
  metrics: TestMetrics;
  duration: number;
}

export interface TestResult {
  pattern: TestPattern;
  prediction: {
    successProbability: number;
    confidence: number;
    estimatedCost?: number;
    estimatedDuration?: number;
    warnings: any[];
  };
  actual: {
    outcome: 'success' | 'failure';
    error?: string;
    cost?: number;
    duration: number;
  };
  accuracy: {
    outcomeCorrect: boolean;
    costError?: number;
    durationError?: number;
  };
}

export interface BenchmarkResult {
  operation: string;
  iterations: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
  p95Duration: number;
  p99Duration: number;
  memoryUsage: {
    initial: number;
    peak: number;
    final: number;
  };
}

export interface LearningCurve {
  trainingSize: number;
  accuracy: number;
  confidence: number;
  timestamp: Date;
}