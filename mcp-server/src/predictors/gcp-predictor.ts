import { RuvFannClient } from '../clients/ruv-fann-client.js';
import { GCPPatternStorage } from '../storage/gcp-pattern-storage.js';
import winston from 'winston';

export interface GCPPrediction {
  successProbability: number;
  confidence: number;
  estimatedDuration?: number;
  estimatedCost?: number;
  warnings: GCPWarning[];
  suggestions: GCPSuggestion[];
  explanation: string;
}

export interface GCPWarning {
  level: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  reason: string;
  preventable: boolean;
}

export interface GCPSuggestion {
  type: 'optimization' | 'alternative' | 'safety' | 'cost_reduction';
  description: string;
  implementation?: {
    tool: string;
    params: any;
  };
  benefitDescription: string;
}

export class GCPPredictor {
  private ruvFannClient: RuvFannClient;
  private patternStorage: GCPPatternStorage;
  private logger: winston.Logger;

  constructor(ruvFannClient: RuvFannClient, patternStorage: GCPPatternStorage) {
    this.ruvFannClient = ruvFannClient;
    this.patternStorage = patternStorage;
    
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'gcp-predictor.log' }),
      ],
    });
  }

  async predictGCPOperation(
    tool: string, 
    params: any, 
    context: any = {}
  ): Promise<GCPPrediction> {
    const startTime = Date.now();
    
    try {
      this.logger.info('Starting GCP operation prediction', { tool, params: this.sanitizeParams(params) });

      // Get historical patterns
      const similarCommands = await this.patternStorage.getSimilarCommands(tool, params, 20);
      const successfulPatterns = await this.patternStorage.getSuccessfulPatterns(tool, 10);

      // Spawn ephemeral agents for analysis
      const [
        patternAnalysis,
        costAnalysis,
        authAnalysis,
        riskAnalysis
      ] = await Promise.all([
        this.analyzePatterns(tool, params, similarCommands),
        this.analyzeCosts(tool, params),
        this.analyzeAuthStatus(context),
        this.analyzeRisks(tool, params, context)
      ]);

      // Use neural network for final prediction
      const neuralPrediction = await this.getNeuralPrediction(tool, params, context);

      // Combine all analyses
      const prediction = this.combinePredictions({
        patternAnalysis,
        costAnalysis,
        authAnalysis,
        riskAnalysis,
        neuralPrediction,
        historicalData: { similarCommands, successfulPatterns }
      });

      const duration = Date.now() - startTime;
      this.logger.info('GCP prediction completed', { 
        tool, 
        duration, 
        successProbability: prediction.successProbability,
        warningCount: prediction.warnings.length
      });

      return prediction;

    } catch (error: any) {
      this.logger.error('GCP prediction failed', { tool, error: error.message });
      
      // Return safe fallback prediction
      return {
        successProbability: 0.5,
        confidence: 0.1,
        warnings: [{
          level: 'medium',
          message: 'Unable to predict outcome due to analysis error',
          reason: error.message,
          preventable: false
        }],
        suggestions: [],
        explanation: 'Prediction system encountered an error. Proceed with caution.'
      };
    }
  }

  private async analyzePatterns(tool: string, params: any, historicalCommands: any[]): Promise<any> {
    if (historicalCommands.length === 0) {
      return {
        successRate: 0.5,
        avgDuration: 5000,
        confidence: 0.1,
        commonErrors: []
      };
    }

    const successfulCommands = historicalCommands.filter(cmd => cmd.outcome === 'success');
    const failedCommands = historicalCommands.filter(cmd => cmd.outcome === 'failure');

    const successRate = successfulCommands.length / historicalCommands.length;
    const avgDuration = historicalCommands.reduce((sum, cmd) => sum + cmd.duration, 0) / historicalCommands.length;
    
    // Extract common error patterns
    const errorCounts = failedCommands.reduce((acc, cmd) => {
      if (cmd.error) {
        acc[cmd.error] = (acc[cmd.error] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);

    const commonErrors = Object.entries(errorCounts)
      .sort(([,a], [,b]) => (b as number) - (a as number))
      .slice(0, 3)
      .map(([error, count]) => ({ error, count }));

    return {
      successRate,
      avgDuration,
      confidence: Math.min(historicalCommands.length / 10, 1.0),
      commonErrors,
      totalSamples: historicalCommands.length
    };
  }

  private async analyzeCosts(tool: string, params: any): Promise<any> {
    // BigQuery cost analysis
    if (tool === 'gcp-sql' || tool === 'bq-query') {
      return await this.analyzeBigQueryCosts(params);
    }

    // Default: no cost implications
    return {
      estimatedCost: 0,
      costWarnings: [],
      confidence: 1.0
    };
  }

  private async analyzeBigQueryCosts(params: any): Promise<any> {
    const warnings = [];
    let estimatedCost = 0;
    let confidence = 0.5;

    // Analyze query for cost indicators
    if (params.query) {
      const query = params.query.toLowerCase();
      
      // Check for expensive patterns
      if (query.includes('select *') && !query.includes('limit')) {
        warnings.push({
          level: 'high' as const,
          message: 'Query uses SELECT * without LIMIT - may scan entire table and incur high costs',
          reason: 'Unbounded SELECT * queries can be very expensive',
          preventable: true
        });
        estimatedCost = 50; // Rough estimate
      }

      if (query.includes('cross join')) {
        warnings.push({
          level: 'critical' as const,
          message: 'CROSS JOIN detected - this will multiply table sizes and costs',
          reason: 'Cross joins create Cartesian products',
          preventable: true
        });
        estimatedCost = Math.max(estimatedCost, 100);
      }

      // Check for public datasets
      if (query.includes('bigquery-public-data')) {
        warnings.push({
          level: 'medium' as const,
          message: 'Querying public datasets - costs may be higher than expected',
          reason: 'Public datasets often contain large amounts of data',
          preventable: false
        });
        confidence = 0.7;
      }

      // Look for historical cost patterns
      const queryType = this.categorizeQuery(query);
      const costPrediction = await this.patternStorage.predictQueryCost(queryType);
      
      if (costPrediction.confidence > 0.5) {
        estimatedCost = costPrediction.avgCost;
        confidence = costPrediction.confidence;
      }
    }

    return {
      estimatedCost,
      costWarnings: warnings,
      confidence
    };
  }

  private categorizeQuery(query: string): string {
    const lowerQuery = query.toLowerCase();
    
    if (lowerQuery.includes('select count(*)')) return 'count';
    if (lowerQuery.includes('group by')) return 'aggregation';
    if (lowerQuery.includes('join')) return 'join';
    if (lowerQuery.includes('select *')) return 'full_scan';
    if (lowerQuery.includes('where')) return 'filtered';
    if (lowerQuery.includes('limit')) return 'limited';
    
    return 'other';
  }

  private async analyzeAuthStatus(context: any): Promise<any> {
    const warnings = [];
    let authScore = 1.0;

    // Estimate token age if available
    const tokenAge = context.authTokenAge || context.token_age_minutes;
    
    if (tokenAge) {
      const authPrediction = await this.patternStorage.predictAuthFailure(tokenAge);
      
      if (authPrediction.failureProbability > 0.3) {
        warnings.push({
          level: 'medium' as const,
          message: `Auth token is ${tokenAge} minutes old - failure probability: ${(authPrediction.failureProbability * 100).toFixed(1)}%`,
          reason: 'Older tokens are more likely to have expired',
          preventable: true
        });
        authScore = 1 - authPrediction.failureProbability;
      }

      if (tokenAge > 60) {
        warnings.push({
          level: 'high' as const,
          message: 'Auth token is over 1 hour old - recommend refresh',
          reason: 'GCP tokens typically expire after 1 hour',
          preventable: true
        });
        authScore = Math.min(authScore, 0.3);
      }
    }

    return {
      authScore,
      authWarnings: warnings,
      tokenAge
    };
  }

  private async analyzeRisks(tool: string, params: any, context: any): Promise<any> {
    const risks = [];

    // BigQuery specific risks
    if (tool === 'gcp-sql' || tool === 'bq-query') {
      if (params.query && !params.query.toLowerCase().includes('limit')) {
        risks.push({
          level: 'medium' as const,
          message: 'Query without LIMIT clause may return large result sets',
          reason: 'Large results can cause timeouts and high costs',
          preventable: true
        });
      }
    }

    // Dataset/table name validation
    if (tool === 'bq-list-tables' || tool === 'gcp-sql') {
      if (params.dataset || params.datasetId) {
        const dataset = params.dataset || params.datasetId;
        // Check against user's common datasets
        const userPatterns = await this.patternStorage.getUserPatterns('default');
        if (userPatterns && userPatterns.frequent_datasets) {
          const frequentDatasets = Array.isArray(userPatterns.frequent_datasets) 
            ? userPatterns.frequent_datasets 
            : JSON.parse(userPatterns.frequent_datasets as string) as string[];
          if (!frequentDatasets.includes(dataset)) {
            risks.push({
              level: 'low' as const,
              message: `Dataset '${dataset}' is not in your frequently used datasets`,
              reason: 'May be a typo or unfamiliar dataset',
              preventable: true
            });
          }
        }
      }
    }

    return {
      risks,
      riskScore: Math.max(0, 1 - risks.length * 0.2)
    };
  }

  private async getNeuralPrediction(tool: string, params: any, context: any): Promise<any> {
    try {
      // Get historical patterns for this tool
      const patterns = await this.patternStorage.getSimilarCommands(tool, params, 10);
      
      // Use enhanced ruv-FANN for detailed prediction
      const response = await this.ruvFannClient.predictPattern(
        tool,
        params,
        patterns,
        context
      );

      // Get raw neural network outputs for detailed analysis
      const rawPrediction = await this.ruvFannClient.predict([[0.1, 0.5, 0.3, 0.2, 0.1, 0.0, 0.0, 0.4, 0.0, 0.0]], context);
      const neuralOutputs = rawPrediction.output || [0.5, 0.0, 0.0, 0.0];
      
      // Generate neural-based warnings
      const neuralWarnings = this.generateNeuralWarnings(neuralOutputs, params);
      
      // Estimate duration and cost based on neural outputs
      const estimatedDuration = this.estimateDurationFromNeural(neuralOutputs, patterns);
      const estimatedCost = this.estimateCostFromNeural(neuralOutputs, params);

      return {
        neuralSuccessProbability: response.successProbability || 0.5,
        neuralDuration: estimatedDuration,
        neuralConfidence: response.confidence || 0.3,
        neuralOutputs: neuralOutputs,
        neuralWarnings: neuralWarnings,
        estimatedCost: estimatedCost,
        failureTypeIndicators: {
          syntax: neuralOutputs[1] || 0.0,
          permission: neuralOutputs[2] || 0.0,
          costPerformance: neuralOutputs[3] || 0.0
        }
      };
    } catch (error: any) {
      this.logger.warn('Neural prediction failed, using fallback', { error: error.message });
      return {
        neuralSuccessProbability: 0.5,
        neuralDuration: 5000,
        neuralConfidence: 0.1,
        neuralOutputs: [0.5, 0.0, 0.0, 0.0],
        neuralWarnings: [],
        estimatedCost: 0.0,
        failureTypeIndicators: {
          syntax: 0.0,
          permission: 0.0,
          costPerformance: 0.0
        }
      };
    }
  }

  private generateNeuralWarnings(neuralOutputs: number[], params: any): GCPWarning[] {
    const warnings: GCPWarning[] = [];
    
    const [successProb, syntaxRisk, permissionRisk, costPerfRisk] = neuralOutputs;
    
    // Syntax warnings
    if (syntaxRisk > 0.6) {
      warnings.push({
        level: syntaxRisk > 0.8 ? 'high' : 'medium',
        message: 'Neural network detected potential syntax error in query',
        reason: 'Query structure analysis indicates missing keywords or invalid syntax patterns',
        preventable: true
      });
    }
    
    // Permission warnings
    if (permissionRisk > 0.5) {
      warnings.push({
        level: permissionRisk > 0.7 ? 'high' : 'medium',
        message: 'Neural network detected potential permission issue',
        reason: 'Access pattern analysis suggests dataset or table access restrictions',
        preventable: true
      });
    }
    
    // Cost/Performance warnings
    if (costPerfRisk > 0.5) {
      if (params.query && (params.query.includes('*') || params.query.includes('JOIN'))) {
        warnings.push({
          level: costPerfRisk > 0.8 ? 'high' : 'medium',
          message: 'Neural network detected high cost/performance risk',
          reason: 'Query patterns suggest expensive operations (full scans, complex joins)',
          preventable: true
        });
      } else {
        warnings.push({
          level: costPerfRisk > 0.8 ? 'high' : 'medium',
          message: 'Neural network detected potential performance issue',
          reason: 'Query complexity indicators suggest potential resource constraints',
          preventable: true
        });
      }
    }
    
    return warnings;
  }

  private estimateDurationFromNeural(neuralOutputs: number[], patterns: any[]): number {
    const [successProb, syntaxRisk, permissionRisk, costPerfRisk] = neuralOutputs;
    
    // Base duration from historical patterns
    let baseDuration = 2000;
    if (patterns.length > 0) {
      const avgDuration = patterns.reduce((sum, p) => sum + (p.duration || 2000), 0) / patterns.length;
      baseDuration = avgDuration;
    }
    
    // Adjust based on neural outputs
    let multiplier = 1.0;
    
    if (syntaxRisk > 0.7) multiplier += 0.5; // Syntax errors cause delays
    if (permissionRisk > 0.7) multiplier += 0.3; // Permission checks add time
    if (costPerfRisk > 0.7) multiplier += 1.0; // High cost queries take longer
    
    // If success probability is high, likely to be faster
    if (successProb > 0.8) multiplier *= 0.8;
    
    return Math.round(baseDuration * multiplier);
  }

  private estimateCostFromNeural(neuralOutputs: number[], params: any): number {
    const [successProb, syntaxRisk, permissionRisk, costPerfRisk] = neuralOutputs;
    
    // Base cost estimation
    let baseCost = 0.01;
    
    // Cost risk strongly indicates higher costs
    if (costPerfRisk > 0.5) {
      baseCost = 0.10 + (costPerfRisk * 2.0); // $0.10 to $2.10 based on risk
    }
    
    // Query-specific cost indicators
    if (params.query) {
      const query = params.query.toLowerCase();
      if (query.includes('*') && !query.includes('limit')) baseCost *= 3;
      if (query.includes('join')) baseCost *= 1.5;
      if (query.includes('group by')) baseCost *= 1.2;
    }
    
    // Failed queries still have minimal cost
    if (successProb < 0.3) baseCost = Math.min(baseCost, 0.05);
    
    return Math.round(baseCost * 100) / 100; // Round to cents
  }

  private combinePredictions(analyses: any): GCPPrediction {
    const {
      patternAnalysis,
      costAnalysis,
      authAnalysis,
      riskAnalysis,
      neuralPrediction
    } = analyses;

    // Weight different prediction sources
    const weights = {
      pattern: 0.4,
      neural: 0.3,
      auth: 0.2,
      risk: 0.1
    };

    const successProbability = (
      patternAnalysis.successRate * weights.pattern +
      neuralPrediction.neuralSuccessProbability * weights.neural +
      authAnalysis.authScore * weights.auth +
      riskAnalysis.riskScore * weights.risk
    );

    const confidence = Math.min(
      patternAnalysis.confidence,
      neuralPrediction.neuralConfidence,
      1.0
    );

    // Combine all warnings including neural-based warnings
    const warnings = [
      ...costAnalysis.costWarnings,
      ...authAnalysis.authWarnings,
      ...riskAnalysis.risks,
      ...(neuralPrediction.neuralWarnings || [])
    ];

    // Generate suggestions
    const suggestions = this.generateSuggestions(analyses);

    // Create explanation
    const explanation = this.generateExplanation(analyses, successProbability);

    return {
      successProbability: Math.max(0, Math.min(1, successProbability)),
      confidence: Math.max(0, Math.min(1, confidence)),
      estimatedDuration: Math.round(
        (patternAnalysis.avgDuration + neuralPrediction.neuralDuration) / 2
      ),
      estimatedCost: neuralPrediction.estimatedCost 
        ? Math.max(costAnalysis.estimatedCost, neuralPrediction.estimatedCost)
        : costAnalysis.estimatedCost,
      warnings,
      suggestions,
      explanation
    };
  }

  private generateSuggestions(analyses: any): GCPSuggestion[] {
    const suggestions: GCPSuggestion[] = [];
    const { costAnalysis, patternAnalysis } = analyses;

    // Cost optimization suggestions
    if (costAnalysis.estimatedCost > 10) {
      suggestions.push({
        type: 'cost_reduction',
        description: 'Add LIMIT clause to reduce query cost',
        implementation: {
          tool: 'gcp-sql',
          params: { query: '/* Add LIMIT 1000 to your query for testing */' }
        },
        benefitDescription: `Could reduce cost from $${costAnalysis.estimatedCost.toFixed(2)} to under $1`
      });
    }

    // Pattern-based suggestions
    if (patternAnalysis.commonErrors.length > 0) {
      const topError = patternAnalysis.commonErrors[0];
      suggestions.push({
        type: 'safety',
        description: `Avoid common error: ${topError.error}`,
        benefitDescription: `This error occurred ${topError.count} times in recent operations`
      });
    }

    return suggestions;
  }

  private generateExplanation(analyses: any, successProbability: number): string {
    const { patternAnalysis, neuralPrediction } = analyses;
    
    let explanation = `Based on analysis of ${patternAnalysis.totalSamples} similar operations, `;
    
    if (successProbability > 0.8) {
      explanation += 'this operation is very likely to succeed. ';
    } else if (successProbability > 0.6) {
      explanation += 'this operation should succeed with some caution. ';
    } else if (successProbability > 0.4) {
      explanation += 'this operation has moderate risk of failure. ';
    } else {
      explanation += 'this operation has high risk of failure. ';
    }

    if (patternAnalysis.totalSamples > 10) {
      explanation += `Historical success rate: ${(patternAnalysis.successRate * 100).toFixed(1)}%.`;
    } else {
      explanation += 'Limited historical data available.';
    }

    return explanation;
  }

  private sanitizeParams(params: any): any {
    if (!params || typeof params !== 'object') return params;
    
    const sanitized = { ...params };
    const sensitiveFields = ['token', 'password', 'secret', 'key'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}