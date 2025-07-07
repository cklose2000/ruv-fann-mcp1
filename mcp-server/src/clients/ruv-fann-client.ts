import axios, { AxiosInstance } from "axios";
import winston from "winston";
import { SQLAnalyzer, SQLAnalysisResult } from '../analyzers/sql-analyzer.js';
import { TrainingDataGenerator } from '../training/training-data-generator.js';

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});

export interface RuvFannConfig {
  coreUrl: string;
  swarmUrl: string;
  modelUrl: string;
}

export interface AgentSpawnRequest {
  agentType: "pattern_matcher" | "outcome_predictor" | "alternative_gen" | "context_analyzer";
  taskData: any;
}

export interface PredictionRequest {
  inputs: number[][];
  context?: any;
}

export interface SwarmAnalysis {
  agentId: string;
  agentType: string;
  analysis: any;
  confidence: number;
  duration: number;
}

export class RuvFannClient {
  private coreClient: AxiosInstance;
  private swarmClient: AxiosInstance;
  private modelClient: AxiosInstance;
  private sqlAnalyzer: SQLAnalyzer;
  private trainingDataGenerator: TrainingDataGenerator;

  constructor(private config: RuvFannConfig) {
    this.coreClient = axios.create({
      baseURL: config.coreUrl,
      timeout: 5000,
      headers: { "Content-Type": "application/json" },
    });

    this.swarmClient = axios.create({
      baseURL: config.swarmUrl,
      timeout: 5000,
      headers: { "Content-Type": "application/json" },
    });

    this.modelClient = axios.create({
      baseURL: config.modelUrl,
      timeout: 5000,
      headers: { "Content-Type": "application/json" },
    });

    this.sqlAnalyzer = new SQLAnalyzer();
    this.trainingDataGenerator = new TrainingDataGenerator();
  }

  async testConnectivity(): Promise<void> {
    try {
      logger.info("Testing ruv-FANN connectivity...");
      
      // Test core service
      const coreHealth = await this.coreClient.get("/health");
      logger.info(`Core service: ${coreHealth.status === 200 ? "OK" : "Failed"}`);
      
      // Test swarm service
      const swarmHealth = await this.swarmClient.get("/health");
      logger.info(`Swarm service: ${swarmHealth.status === 200 ? "OK" : "Failed"}`);
      
      // Test model service
      const modelHealth = await this.modelClient.get("/health");
      logger.info(`Model service: ${modelHealth.status === 200 ? "OK" : "Failed"}`);
    } catch (error: any) {
      logger.error("Connectivity test failed:", error);
      throw new Error("Failed to connect to ruv-FANN services");
    }
  }

  async spawnPatternAnalysisAgents(
    tool: string,
    params: any,
    context: any
  ): Promise<SwarmAnalysis[]> {
    const agentTypes: AgentSpawnRequest["agentType"][] = [
      "pattern_matcher",
      "outcome_predictor",
      "alternative_gen",
      "context_analyzer",
    ];

    const spawnPromises = agentTypes.map(async (agentType) => {
      try {
        const response = await this.swarmClient.post("/api/agent/spawn", {
          agent_type: agentType,
          task_data: {
            tool,
            params,
            context,
            timestamp: new Date().toISOString(),
          },
        });

        // Wait for agent to complete analysis
        const agentId = response.data.agent_id;
        const analysisResponse = await this.swarmClient.get(
          `/api/agent/${agentId}/result`,
          { timeout: 100 } // 100ms timeout for ephemeral agents
        );

        return {
          agentId,
          agentType,
          analysis: analysisResponse.data.result,
          confidence: analysisResponse.data.confidence || 0.5,
          duration: analysisResponse.data.duration_ms || 0,
        };
      } catch (error: any) {
        logger.warn(`Agent ${agentType} failed:`, error);
        return {
          agentId: "error",
          agentType,
          analysis: null,
          confidence: 0,
          duration: 0,
        };
      }
    });

    return Promise.all(spawnPromises);
  }

  async predict(inputs: number[][], context?: any): Promise<any> {
    try {
      // Convert inputs array to single input vector for the neural network
      const input = inputs.length > 0 ? inputs[0] : [];
      
      const response = await this.coreClient.post("/api/network/predict", {
        input,
        context,
      });
      return response.data;
    } catch (error: any) {
      logger.error("Prediction failed:", error);
      throw error;
    }
  }

  async trainPattern(
    inputs: number[][],
    targets: number[][],
    epochs: number = 100
  ): Promise<void> {
    try {
      await this.coreClient.post("/api/network/train", {
        inputs,
        targets,
        epochs,
      });
    } catch (error: any) {
      logger.error("Training failed:", error);
      throw error;
    }
  }

  async forecast(values: number[], horizon: number = 5): Promise<any> {
    try {
      const response = await this.modelClient.post("/api/forecast", {
        values,
        horizon,
      });
      return response.data;
    } catch (error: any) {
      logger.error("Forecast failed:", error);
      throw error;
    }
  }

  async predictPattern(
    tool: string,
    params: any,
    patterns: any[],
    context?: any
  ): Promise<{ successProbability: number; confidence: number }> {
    try {
      // Convert patterns to numerical inputs for the neural network
      const inputs = this.patternsToInputs(patterns, tool, params);
      
      // Use the core prediction API
      const response = await this.predict(inputs, {
        ...context,
        tool,
        params,
        patternCount: patterns.length
      });
      
      // Enhanced interpretation of 4-output neural network
      const outputs = response.output || [0.5, 0.0, 0.0, 0.0];
      
      // outputs[0] = success probability
      // outputs[1] = syntax failure indicator  
      // outputs[2] = permission failure indicator
      // outputs[3] = cost/performance failure indicator
      
      const successProbability = outputs[0];
      const syntaxFailureRisk = outputs[1];
      const permissionFailureRisk = outputs[2]; 
      const costPerformanceRisk = outputs[3];
      
      // Calculate overall confidence based on output consistency
      let confidence = 0.5;
      
      if (successProbability > 0.7) {
        // High success probability - confidence based on low failure risks
        confidence = Math.max(0.7, 1.0 - Math.max(syntaxFailureRisk, permissionFailureRisk, costPerformanceRisk));
      } else if (successProbability < 0.3) {
        // Low success probability - confidence based on clear failure type
        const maxFailureRisk = Math.max(syntaxFailureRisk, permissionFailureRisk, costPerformanceRisk);
        confidence = Math.min(0.9, 0.5 + maxFailureRisk);
      } else {
        // Uncertain prediction - lower confidence
        confidence = 0.3 + Math.abs(successProbability - 0.5) * 0.4;
      }
      
      logger.debug('Enhanced neural prediction interpretation', {
        successProbability: successProbability.toFixed(3),
        syntaxRisk: syntaxFailureRisk.toFixed(3),
        permissionRisk: permissionFailureRisk.toFixed(3),
        costPerfRisk: costPerformanceRisk.toFixed(3),
        finalConfidence: confidence.toFixed(3)
      });
      
      return { successProbability, confidence };
    } catch (error: any) {
      logger.error("Pattern prediction failed:", error);
      // Return neutral prediction on error
      return { successProbability: 0.5, confidence: 0.1 };
    }
  }

  private patternsToInputs(patterns: any[], tool: string, params: any): number[][] {
    try {
      // Enhanced feature extraction using SQL analysis
      let sqlAnalysis: SQLAnalysisResult | null = null;
      
      // Extract SQL query from params
      let query = '';
      if (params.query) {
        query = params.query;
      } else if (params.operation && params.dataset && params.table) {
        // Construct query for operations like describe-table, list-tables, etc.
        query = `SELECT * FROM ${params.dataset}.${params.table}`;
      }
      
      // Analyze SQL query if available
      if (query) {
        sqlAnalysis = this.sqlAnalyzer.analyzeQuery(query, params);
        logger.debug('SQL analysis complete', { 
          syntaxScore: sqlAnalysis.syntaxScore,
          costRisk: sqlAnalysis.costRisk,
          complexityScore: sqlAnalysis.complexityScore 
        });
      }
      
      // Use intelligent feature extraction
      if (sqlAnalysis) {
        const features = this.trainingDataGenerator.queryToFeatures(query, params, sqlAnalysis);
        
        // Add historical pattern context
        if (patterns.length > 0) {
          const totalPatterns = patterns.length;
          const successCount = patterns.filter(p => p.outcome === 'success').length;
          const successRate = successCount / totalPatterns;
          
          // Blend SQL analysis with historical patterns
          features[1] = (features[1] + successRate) / 2; // Blend syntax score with historical success
          features[7] = Math.max(features[7], successRate < 0.3 ? 0.8 : 0.2); // Increase cost risk if low success rate
        }
        
        logger.debug('Enhanced feature extraction complete', { 
          features: features.map(f => f.toFixed(3)),
          queryLength: query.length,
          patternCount: patterns.length
        });
        
        return [features];
      } else {
        // Fallback to enhanced generic extraction
        return this.fallbackFeatureExtraction(patterns, tool, params);
      }
    } catch (error: any) {
      logger.error('Enhanced feature extraction failed, using fallback', { error: error.message });
      return this.fallbackFeatureExtraction(patterns, tool, params);
    }
  }

  private fallbackFeatureExtraction(patterns: any[], tool: string, params: any): number[][] {
    // Enhanced fallback feature extraction
    const features: number[] = [];
    
    // Tool-specific encoding (more sophisticated)
    const toolMap: { [key: string]: number } = {
      'bq-query': 0.1,
      'bq-list-tables': 0.2,
      'bq-list-datasets': 0.3,
      'gcp-sql': 0.4,
      'bq-create-dataset': 0.5,
      'default': 0.6
    };
    features.push(toolMap[tool] || toolMap['default']);
    
    // Pattern statistics with more context
    const totalPatterns = patterns.length || 1;
    const successCount = patterns.filter(p => p.outcome === 'success').length;
    const avgDuration = patterns.reduce((sum, p) => sum + (p.duration || 0), 0) / totalPatterns;
    
    features.push(successCount / totalPatterns); // Success rate
    features.push(Math.min(avgDuration / 10000, 1)); // Normalized duration
    features.push(Math.min(totalPatterns / 100, 1)); // Pattern count normalized
    
    // Enhanced param-based features
    if (params.projectId) {
      features.push(this.hashString(params.projectId) % 100 / 100);
    } else {
      features.push(0.5); // Default project
    }
    
    if (params.datasetId || params.dataset) {
      features.push(this.hashString(params.datasetId || params.dataset) % 100 / 100);
    } else {
      features.push(0);
    }
    
    // Query complexity indicators
    if (params.query) {
      const queryLower = params.query.toLowerCase();
      const complexityScore = (
        (queryLower.includes('join') ? 0.2 : 0) +
        (queryLower.includes('union') ? 0.2 : 0) +
        (queryLower.includes('group by') ? 0.1 : 0) +
        (queryLower.includes('order by') ? 0.1 : 0) +
        (queryLower.includes('*') && !queryLower.includes('limit') ? 0.3 : 0) +
        (queryLower.includes('where') ? -0.1 : 0.2) // WHERE clauses reduce risk
      );
      features.push(Math.min(1, Math.max(0, complexityScore)));
    } else {
      features.push(0.1); // Low complexity for non-query operations
    }
    
    // Risk indicators
    const riskScore = (
      (params.datasetId && params.datasetId.includes('restricted') ? 0.5 : 0) +
      (params.query && params.query.toLowerCase().includes('*') ? 0.3 : 0) +
      (params.query && !params.query.toLowerCase().includes('limit') ? 0.2 : 0)
    );
    features.push(Math.min(1, riskScore));
    
    // Recent pattern trends (improved)
    const recentPatterns = patterns.slice(-5);
    const recentSuccessRate = recentPatterns.filter(p => p.outcome === 'success').length / (recentPatterns.length || 1);
    features.push(recentSuccessRate);
    
    // Structure completeness score
    if (params.query) {
      const queryLower = params.query.toLowerCase();
      const structureScore = (
        (queryLower.includes('select') ? 0.3 : 0) +
        (queryLower.includes('from') ? 0.3 : 0) +
        (queryLower.includes('where') ? 0.2 : 0) +
        (queryLower.includes('limit') ? 0.2 : 0)
      );
      features.push(structureScore);
    } else {
      features.push(0.8); // Non-query operations have good structure
    }
    
    // Ensure exactly 10 features
    while (features.length < 10) {
      features.push(0);
    }
    
    return [features.slice(0, 10)];
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}