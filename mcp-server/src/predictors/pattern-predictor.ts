import winston from "winston";
import { RuvFannClient, SwarmAnalysis } from "../clients/ruv-fann-client.js";
import { PatternLearner } from "../learners/pattern-learner.js";
import { ToolContext } from "../interceptors/tool-interceptor.js";

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});

export interface PredictionResult {
  successProbability: number;
  confidence: number;
  predictedDuration?: number;
  warnings?: Warning[];
  suggestions?: Suggestion[];
  explanation: string;
  patterns?: MatchedPattern[];
}

export interface Warning {
  level: "low" | "medium" | "high";
  message: string;
  suggestion?: Suggestion;
}

export interface Suggestion {
  tool: string;
  params: any;
  rationale: string;
  successProbability: number;
}

export interface MatchedPattern {
  id: string;
  type: string;
  confidence: number;
  description: string;
}

export class PatternPredictor {
  private predictionCache = new Map<string, PredictionResult>();
  private cacheTimeout = 60000; // 1 minute cache

  constructor(
    private ruvFannClient: RuvFannClient,
    private patternLearner: PatternLearner
  ) {}

  async predict(
    tool: string,
    params: any,
    context: ToolContext
  ): Promise<PredictionResult> {
    const cacheKey = this.getCacheKey(tool, params);
    
    // Check cache
    const cached = this.predictionCache.get(cacheKey);
    if (cached) {
      logger.debug("Using cached prediction");
      return cached;
    }

    try {
      // Spawn ephemeral agents for analysis
      const startTime = Date.now();
      const swarmAnalyses = await this.ruvFannClient.spawnPatternAnalysisAgents(
        tool,
        params,
        context
      );
      const analysisTime = Date.now() - startTime;
      logger.debug(`Swarm analysis completed in ${analysisTime}ms`);

      // Get historical patterns from learner
      const historicalPatterns = await this.patternLearner.findSimilarPatterns(
        tool,
        params,
        context
      );

      // Combine analyses into prediction
      const prediction = await this.synthesizePrediction(
        tool,
        params,
        context,
        swarmAnalyses,
        historicalPatterns
      );

      // Cache the result
      this.predictionCache.set(cacheKey, prediction);
      setTimeout(() => {
        this.predictionCache.delete(cacheKey);
      }, this.cacheTimeout);

      return prediction;
    } catch (error) {
      logger.error("Prediction failed:", error);
      
      // Return conservative prediction on error
      return {
        successProbability: 0.5,
        confidence: 0.1,
        explanation: "Unable to generate prediction due to error",
        warnings: [{
          level: "low",
          message: "Prediction system unavailable, proceed with caution",
        }],
      };
    }
  }

  private async synthesizePrediction(
    tool: string,
    params: any,
    context: ToolContext,
    swarmAnalyses: SwarmAnalysis[],
    historicalPatterns: any[]
  ): Promise<PredictionResult> {
    // Extract predictions from swarm analyses
    const patternMatcher = swarmAnalyses.find(a => a.agentType === "pattern_matcher");
    const outcomePredictor = swarmAnalyses.find(a => a.agentType === "outcome_predictor");
    const alternativeGen = swarmAnalyses.find(a => a.agentType === "alternative_gen");
    const contextAnalyzer = swarmAnalyses.find(a => a.agentType === "context_analyzer");

    // Calculate base success probability
    let successProbability = 0.5; // neutral starting point
    let totalWeight = 0;

    // Weight historical patterns heavily
    if (historicalPatterns.length > 0) {
      const historicalSuccess = historicalPatterns.filter(p => p.outcome === "success").length;
      const historicalRate = historicalSuccess / historicalPatterns.length;
      successProbability = historicalRate * 0.6; // 60% weight
      totalWeight = 0.6;
    }

    // Add outcome predictor's assessment
    if (outcomePredictor && outcomePredictor.analysis) {
      const predictorRate = outcomePredictor.analysis.successRate || 0.5;
      successProbability += predictorRate * 0.3; // 30% weight
      totalWeight += 0.3;
    }

    // Context analyzer can modify probability
    if (contextAnalyzer && contextAnalyzer.analysis) {
      const contextModifier = contextAnalyzer.analysis.riskFactor || 1.0;
      successProbability *= contextModifier;
    }

    // Normalize
    if (totalWeight > 0) {
      successProbability = successProbability / totalWeight;
    }

    // Calculate confidence based on data quality
    const confidence = this.calculateConfidence(
      swarmAnalyses,
      historicalPatterns.length
    );

    // Generate warnings and suggestions
    const warnings = this.generateWarnings(
      tool,
      params,
      successProbability,
      patternMatcher?.analysis
    );

    const suggestions = alternativeGen?.analysis?.alternatives || [];

    // Build explanation
    const explanation = this.buildExplanation(
      successProbability,
      confidence,
      historicalPatterns.length,
      swarmAnalyses
    );

    return {
      successProbability,
      confidence,
      predictedDuration: this.estimateDuration(historicalPatterns),
      warnings,
      suggestions,
      explanation,
      patterns: this.extractMatchedPatterns(patternMatcher?.analysis),
    };
  }

  private calculateConfidence(
    swarmAnalyses: SwarmAnalysis[],
    historicalCount: number
  ): number {
    let confidence = 0.1; // base confidence

    // More historical data = higher confidence
    confidence += Math.min(historicalCount * 0.05, 0.3);

    // Successful swarm analyses increase confidence
    const successfulAnalyses = swarmAnalyses.filter(a => a.analysis !== null).length;
    confidence += successfulAnalyses * 0.15;

    // Agreement between agents increases confidence
    if (successfulAnalyses > 2) {
      confidence += 0.2;
    }

    return Math.min(confidence, 0.95); // Cap at 95%
  }

  private generateWarnings(
    tool: string,
    params: any,
    successProbability: number,
    patternAnalysis: any
  ): Warning[] {
    const warnings: Warning[] = [];

    // Low success probability warning
    if (successProbability < 0.3) {
      warnings.push({
        level: "high",
        message: "High risk of failure based on historical patterns",
      });
    } else if (successProbability < 0.5) {
      warnings.push({
        level: "medium",
        message: "Moderate risk of failure",
      });
    }

    // Tool-specific warnings
    if (tool === "bq query" && params.query?.includes("SELECT *")) {
      warnings.push({
        level: "medium",
        message: "SELECT * may result in high costs on large tables",
        suggestion: {
          tool: "bq query",
          params: { ...params, query: params.query.replace("SELECT *", "SELECT * LIMIT 1000") },
          rationale: "Add LIMIT to prevent excessive scanning",
          successProbability: 0.9,
        },
      });
    }

    // Pattern-based warnings
    if (patternAnalysis?.risks) {
      for (const risk of patternAnalysis.risks) {
        warnings.push({
          level: risk.severity || "low",
          message: risk.description,
        });
      }
    }

    return warnings;
  }

  private buildExplanation(
    successProbability: number,
    confidence: number,
    historicalCount: number,
    swarmAnalyses: SwarmAnalysis[]
  ): string {
    const parts: string[] = [];

    parts.push(`Prediction based on ${historicalCount} similar past executions`);
    
    if (confidence > 0.7) {
      parts.push("with high confidence");
    } else if (confidence > 0.4) {
      parts.push("with moderate confidence");
    } else {
      parts.push("with low confidence");
    }

    const activeAgents = swarmAnalyses.filter(a => a.analysis !== null).length;
    parts.push(`(${activeAgents}/4 analysis agents succeeded)`);

    return parts.join(" ");
  }

  private estimateDuration(historicalPatterns: any[]): number | undefined {
    if (historicalPatterns.length === 0) return undefined;

    const durations = historicalPatterns
      .filter(p => p.duration)
      .map(p => p.duration);

    if (durations.length === 0) return undefined;

    // Return median duration
    durations.sort((a, b) => a - b);
    return durations[Math.floor(durations.length / 2)];
  }

  private extractMatchedPatterns(patternAnalysis: any): MatchedPattern[] {
    if (!patternAnalysis?.patterns) return [];

    return patternAnalysis.patterns.map((p: any) => ({
      id: p.id,
      type: p.type,
      confidence: p.confidence || 0.5,
      description: p.description || "Unknown pattern",
    }));
  }

  async generateAlternatives(
    tool: string,
    params: any,
    goal?: string
  ): Promise<Suggestion[]> {
    // Use ruv-FANN to generate alternatives
    const swarmAnalyses = await this.ruvFannClient.spawnPatternAnalysisAgents(
      tool,
      params,
      { goal }
    );

    const alternativeGen = swarmAnalyses.find(a => a.agentType === "alternative_gen");
    return alternativeGen?.analysis?.alternatives || [];
  }

  async predictNextTool(recentTools: string[]): Promise<any> {
    // Use time series prediction for tool sequences
    const toolIndices = recentTools.map(t => this.toolToIndex(t));
    const forecast = await this.ruvFannClient.forecast(toolIndices, 3);

    return {
      predictions: forecast.predictions?.map((idx: number) => this.indexToTool(idx)),
      confidence: forecast.confidence,
    };
  }

  async getStatistics(): Promise<any> {
    const stats = await this.patternLearner.getStatistics();
    
    return {
      ...stats,
      cacheSize: this.predictionCache.size,
      recentPredictions: Array.from(this.predictionCache.entries())
        .slice(-10)
        .map(([key, pred]) => ({
          key,
          successProbability: pred.successProbability,
          confidence: pred.confidence,
        })),
    };
  }

  private getCacheKey(tool: string, params: any): string {
    return `${tool}:${JSON.stringify(params)}`;
  }

  private toolToIndex(tool: string): number {
    // Simple mapping for demo - should be more sophisticated
    const tools = ["bash", "read", "write", "grep", "ls", "git", "bq", "gcloud"];
    return tools.indexOf(tool.split(" ")[0]) + 1;
  }

  private indexToTool(index: number): string {
    const tools = ["unknown", "bash", "read", "write", "grep", "ls", "git", "bq", "gcloud"];
    return tools[Math.min(index, tools.length - 1)];
  }
}