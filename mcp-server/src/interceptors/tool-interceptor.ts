import winston from "winston";
import { PatternPredictor, PredictionResult } from "../predictors/pattern-predictor.js";
import { PatternLearner } from "../learners/pattern-learner.js";

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});

export interface ToolRequest {
  tool: string;
  params: any;
  context: ToolContext;
}

export interface ToolContext {
  recentTools?: ToolExecution[];
  projectType?: string;
  currentDirectory?: string;
  environment?: Record<string, string>;
}

export interface ToolExecution {
  tool: string;
  params: any;
  timestamp: Date;
  outcome: "success" | "failure";
  duration: number;
  error?: string;
}

export class ToolInterceptor {
  private recentExecutions: ToolExecution[] = [];
  private maxHistorySize = 100;

  constructor(
    private predictor: PatternPredictor,
    private learner: PatternLearner
  ) {}

  async interceptToolRequest(
    tool: string,
    params: any,
    context: ToolContext = {}
  ): Promise<PredictionResult> {
    logger.debug(`Intercepting tool request: ${tool}`, { params });

    // Add recent executions to context
    const enrichedContext: ToolContext = {
      ...context,
      recentTools: this.recentExecutions.slice(-10),
    };

    // Get prediction from pattern predictor
    const prediction = await this.predictor.predict(tool, params, enrichedContext);

    // Log prediction for analysis
    logger.info(`Prediction for ${tool}:`, {
      successProbability: prediction.successProbability,
      confidence: prediction.confidence,
      warnings: prediction.warnings,
    });

    // If high risk of failure, enhance the response
    if (prediction.successProbability < 0.3 && prediction.confidence > 0.7) {
      prediction.warnings = prediction.warnings || [];
      prediction.warnings.push({
        level: "high",
        message: `This command has a ${Math.round((1 - prediction.successProbability) * 100)}% chance of failure based on past patterns`,
        suggestion: prediction.suggestions?.[0],
      });
    }

    return prediction;
  }

  async recordOutcome(
    tool: string,
    params: any,
    outcome: "success" | "failure",
    duration: number,
    error?: string
  ): Promise<void> {
    const execution: ToolExecution = {
      tool,
      params,
      timestamp: new Date(),
      outcome,
      duration,
      error,
    };

    // Add to recent history
    this.recentExecutions.push(execution);
    if (this.recentExecutions.length > this.maxHistorySize) {
      this.recentExecutions.shift();
    }

    // Record in pattern learner
    await this.learner.recordExecution(execution);

    // Log outcome
    logger.info(`Recorded outcome for ${tool}: ${outcome}`, {
      duration,
      error,
    });
  }

  async analyzeSequence(tools: string[]): Promise<any> {
    // Analyze common sequences
    const sequences = this.findCommonSequences(tools);
    
    // Predict likely next tools
    const predictions = await this.predictor.predictNextTool(tools);
    
    return {
      commonSequences: sequences,
      likelyNext: predictions,
      riskAnalysis: await this.analyzeSequenceRisks(tools),
    };
  }

  private findCommonSequences(tools: string[]): any[] {
    const sequences: Map<string, number> = new Map();
    
    // Look for patterns in recent executions
    for (let i = 0; i < this.recentExecutions.length - tools.length; i++) {
      const sequence = this.recentExecutions
        .slice(i, i + tools.length)
        .map(e => e.tool)
        .join(" -> ");
      
      sequences.set(sequence, (sequences.get(sequence) || 0) + 1);
    }
    
    // Sort by frequency
    return Array.from(sequences.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([sequence, count]) => ({ sequence, count }));
  }

  private async analyzeSequenceRisks(tools: string[]): Promise<any> {
    const risks = [];
    
    // Check for known risky patterns
    if (tools.includes("git push") && !tools.includes("git pull")) {
      risks.push({
        level: "medium",
        pattern: "Push without pull",
        suggestion: "Consider pulling latest changes first",
      });
    }
    
    if (tools.includes("bq query") && !tools.includes("bq show")) {
      risks.push({
        level: "low",
        pattern: "Query without schema check",
        suggestion: "Verify table schema before querying",
      });
    }
    
    return risks;
  }

  getRecentHistory(): ToolExecution[] {
    return [...this.recentExecutions];
  }

  clearHistory(): void {
    this.recentExecutions = [];
  }
}