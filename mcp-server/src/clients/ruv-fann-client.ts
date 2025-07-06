import axios, { AxiosInstance } from "axios";
import winston from "winston";

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
    } catch (error) {
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
      } catch (error) {
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
      const response = await this.coreClient.post("/api/network/predict", {
        inputs,
        context,
      });
      return response.data;
    } catch (error) {
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
    } catch (error) {
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
    } catch (error) {
      logger.error("Forecast failed:", error);
      throw error;
    }
  }
}