#!/usr/bin/env node
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import winston from "winston";

import { RuvFannClient } from "./clients/ruv-fann-client.js";
import { ToolInterceptor } from "./interceptors/tool-interceptor.js";
import { PatternPredictor } from "./predictors/pattern-predictor.js";
import { PatternLearner } from "./learners/pattern-learner.js";

// Configure logging
const logger = winston.createLogger({
  level: "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: "mcp-server.log" }),
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
  ],
});

class RuvFannMCPServer {
  private server: Server;
  private ruvFannClient: RuvFannClient;
  private toolInterceptor: ToolInterceptor;
  private patternPredictor: PatternPredictor;
  private patternLearner: PatternLearner;

  constructor() {
    this.server = new Server(
      {
        name: "ruv-fann-mcp",
        version: "0.1.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Initialize components
    this.ruvFannClient = new RuvFannClient({
      coreUrl: process.env.RUV_FANN_CORE_URL || "http://localhost:8090",
      swarmUrl: process.env.RUV_FANN_SWARM_URL || "http://localhost:8081",
      modelUrl: process.env.RUV_FANN_MODEL_URL || "http://localhost:8082",
    });

    this.patternLearner = new PatternLearner();
    this.patternPredictor = new PatternPredictor(this.ruvFannClient, this.patternLearner);
    this.toolInterceptor = new ToolInterceptor(this.patternPredictor, this.patternLearner);

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          {
            name: "predict_outcome",
            description: "Predict the outcome of a command based on learned patterns",
            inputSchema: {
              type: "object",
              properties: {
                tool: { type: "string", description: "Tool name to execute" },
                params: { type: "object", description: "Tool parameters" },
                context: { type: "object", description: "Current context" },
              },
              required: ["tool", "params"],
            },
          },
          {
            name: "learn_pattern",
            description: "Learn from command execution outcome",
            inputSchema: {
              type: "object",
              properties: {
                tool: { type: "string" },
                params: { type: "object" },
                outcome: { type: "string", enum: ["success", "failure"] },
                duration: { type: "number" },
                error: { type: "string" },
              },
              required: ["tool", "params", "outcome"],
            },
          },
          {
            name: "get_suggestions",
            description: "Get alternative suggestions for a command",
            inputSchema: {
              type: "object",
              properties: {
                tool: { type: "string" },
                params: { type: "object" },
                goal: { type: "string" },
              },
              required: ["tool", "params"],
            },
          },
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      logger.info(`Tool called: ${request.params.name}`, request.params.arguments);

      switch (request.params.name) {
        case "predict_outcome":
          return this.handlePredictOutcome(request.params.arguments);
        
        case "learn_pattern":
          return this.handleLearnPattern(request.params.arguments);
        
        case "get_suggestions":
          return this.handleGetSuggestions(request.params.arguments);
        
        default:
          throw new Error(`Unknown tool: ${request.params.name}`);
      }
    });

    // List resources (patterns, statistics)
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: [
          {
            uri: "patterns://learned",
            name: "Learned Patterns",
            description: "All learned command patterns",
            mimeType: "application/json",
          },
          {
            uri: "statistics://predictions",
            name: "Prediction Statistics",
            description: "Accuracy and performance statistics",
            mimeType: "application/json",
          },
        ],
      };
    });

    // Read resources
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params.uri;
      
      if (uri.startsWith("patterns://")) {
        const patterns = await this.patternLearner.getPatterns();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(patterns, null, 2),
            },
          ],
        };
      } else if (uri.startsWith("statistics://")) {
        const stats = await this.patternPredictor.getStatistics();
        return {
          contents: [
            {
              uri,
              mimeType: "application/json",
              text: JSON.stringify(stats, null, 2),
            },
          ],
        };
      }
      
      throw new Error(`Resource not found: ${uri}`);
    });
  }

  private async handlePredictOutcome(args: any) {
    try {
      const prediction = await this.toolInterceptor.interceptToolRequest(
        args.tool,
        args.params,
        args.context || {}
      );
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(prediction, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Prediction error:", error);
      throw error;
    }
  }

  private async handleLearnPattern(args: any) {
    try {
      await this.toolInterceptor.recordOutcome(
        args.tool,
        args.params,
        args.outcome,
        args.duration,
        args.error
      );
      
      return {
        content: [
          {
            type: "text",
            text: "Pattern learned successfully",
          },
        ],
      };
    } catch (error) {
      logger.error("Learning error:", error);
      throw error;
    }
  }

  private async handleGetSuggestions(args: any) {
    try {
      const suggestions = await this.patternPredictor.generateAlternatives(
        args.tool,
        args.params,
        args.goal
      );
      
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(suggestions, null, 2),
          },
        ],
      };
    } catch (error) {
      logger.error("Suggestion error:", error);
      throw error;
    }
  }

  async start() {
    logger.info("Starting ruv-FANN MCP server...");
    
    // Initialize pattern database
    await this.patternLearner.initialize();
    
    // Test ruv-FANN connectivity
    await this.ruvFannClient.testConnectivity();
    
    // Start MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    logger.info("ruv-FANN MCP server started successfully");
  }
}

// Start the server
const server = new RuvFannMCPServer();
server.start().catch((error) => {
  logger.error("Failed to start server:", error);
  process.exit(1);
});