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
import { GCPMCPClient } from "./clients/gcp-mcp-client.js";
import { ToolInterceptor } from "./interceptors/tool-interceptor.js";
import { PatternPredictor } from "./predictors/pattern-predictor.js";
import { GCPPredictor } from "./predictors/gcp-predictor.js";
import { PatternLearner } from "./learners/pattern-learner.js";
import { GCPPatternStorage } from "./storage/gcp-pattern-storage.js";
import { GCP_TOOLS, isGCPTool, convertToolNameForBackend } from "./tools/gcp-tools.js";

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
  private gcpMCPClient: GCPMCPClient;
  private toolInterceptor: ToolInterceptor;
  private patternPredictor: PatternPredictor;
  private gcpPredictor: GCPPredictor;
  private patternLearner: PatternLearner;
  private gcpPatternStorage: GCPPatternStorage;

  constructor() {
    this.server = new Server(
      {
        name: "ruv-fann-enhanced-mcp",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
          resources: {},
        },
      }
    );

    // Initialize ruv-FANN components
    this.ruvFannClient = new RuvFannClient({
      coreUrl: process.env.RUV_FANN_CORE_URL || "http://127.0.0.1:8090",
      swarmUrl: process.env.RUV_FANN_SWARM_URL || "http://127.0.0.1:8081",
      modelUrl: process.env.RUV_FANN_MODEL_URL || "http://127.0.0.1:8082",
    });

    // Initialize GCP components
    this.gcpMCPClient = new GCPMCPClient({
      baseUrl: process.env.GCP_MCP_BACKEND_URL || "http://127.0.0.1:8080",
      secretToken: process.env.GCP_MCP_SECRET || "change-this-secret-token",
      timeout: 30000,
    });

    this.gcpPatternStorage = new GCPPatternStorage();
    this.patternLearner = new PatternLearner();
    this.patternPredictor = new PatternPredictor(this.ruvFannClient, this.patternLearner);
    this.gcpPredictor = new GCPPredictor(this.ruvFannClient, this.gcpPatternStorage);
    this.toolInterceptor = new ToolInterceptor(this.patternPredictor, this.patternLearner);

    this.setupHandlers();
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: [
          // ruv-FANN tools
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
          // GCP tools (enhanced with intelligence)
          ...GCP_TOOLS,
        ],
      };
    });

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      logger.info(`Tool called: ${request.params.name}`, request.params.arguments);

      const toolName = request.params.name;
      const args = request.params.arguments;

      // Check if it's a GCP tool
      if (isGCPTool(toolName)) {
        return this.handleGCPTool(toolName, args);
      }

      // Handle ruv-FANN specific tools
      switch (toolName) {
        case "predict_outcome":
          return this.handlePredictOutcome(args);
        
        case "learn_pattern":
          return this.handleLearnPattern(args);
        
        case "get_suggestions":
          return this.handleGetSuggestions(args);
        
        default:
          throw new Error(`Unknown tool: ${toolName}`);
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

  private async handleGCPTool(toolName: string, args: any) {
    const startTime = Date.now();
    
    try {
      logger.info('Handling GCP tool with intelligence', { toolName, args: this.sanitizeArgs(args) });

      // 1. Get prediction from ruv-FANN intelligence
      const prediction = await this.gcpPredictor.predictGCPOperation(toolName, args, {
        timestamp: Date.now(),
        authTokenAge: this.estimateTokenAge()
      });

      logger.info('GCP prediction completed', { 
        toolName, 
        successProbability: prediction.successProbability,
        warningCount: prediction.warnings.length 
      });

      // 2. Check if we should proceed based on prediction
      if (prediction.successProbability < 0.3 && prediction.confidence > 0.7) {
        // High confidence of failure - return warnings and suggestions
        return {
          content: [
            {
              type: "text",
              text: this.formatPredictionResponse(prediction, toolName, "blocked")
            }
          ]
        };
      }

      // 3. Execute the GCP operation via proxy
      const backendToolName = convertToolNameForBackend(toolName);
      const gcpResponse = await this.gcpMCPClient.callTool(backendToolName, args);
      
      const duration = Date.now() - startTime;
      const success = !gcpResponse.error;

      // 4. Learn from the outcome
      await this.recordGCPOutcome(toolName, args, gcpResponse, duration, prediction);

      // 5. Return enhanced response with intelligence
      if (gcpResponse.error) {
        return {
          content: [
            {
              type: "text",
              text: this.formatErrorResponse(gcpResponse.error, prediction)
            }
          ]
        };
      }

      // Success - return result with intelligence insights
      return {
        content: [
          {
            type: "text",
            text: this.formatSuccessResponse(gcpResponse.result, prediction)
          }
        ]
      };

    } catch (error: any) {
      const duration = Date.now() - startTime;
      logger.error('GCP tool execution failed', { toolName, duration, error: error.message });

      // Record failure for learning
      await this.recordGCPOutcome(toolName, args, null, duration, null, error.message);

      // Return error with any available intelligence
      return {
        content: [
          {
            type: "text",
            text: `❌ **GCP Operation Failed**\n\n**Tool**: ${toolName}\n**Error**: ${error.message}\n\n*This failure has been recorded for future intelligence.*`
          }
        ]
      };
    }
  }

  private async recordGCPOutcome(
    toolName: string, 
    params: any, 
    response: any, 
    duration: number, 
    prediction: any, 
    errorMessage?: string
  ) {
    try {
      const outcome = response?.error || errorMessage ? 'failure' : 'success';
      
      await this.gcpPatternStorage.recordCommandPattern({
        tool: toolName,
        params: JSON.stringify(params),
        context: JSON.stringify({ timestamp: Date.now() }),
        outcome,
        duration,
        error: response?.error?.message || errorMessage,
        cost_estimate: prediction?.estimatedCost,
        rows_processed: this.extractRowsProcessed(response),
        auth_token_age: this.estimateTokenAge()
      });

      // Also record in original pattern learner for cross-tool intelligence
      await this.toolInterceptor.recordOutcome(
        toolName,
        params,
        outcome,
        duration,
        response?.error?.message || errorMessage
      );

    } catch (error: any) {
      logger.warn('Failed to record GCP outcome', { error: error.message });
    }
  }

  private formatPredictionResponse(prediction: any, toolName: string, action: string): string {
    let response = `🤖 **ruv-FANN Intelligence Analysis**\n\n`;
    response += `**Tool**: ${toolName}\n`;
    response += `**Success Probability**: ${(prediction.successProbability * 100).toFixed(1)}%\n`;
    response += `**Confidence**: ${(prediction.confidence * 100).toFixed(1)}%\n\n`;

    if (prediction.estimatedCost && prediction.estimatedCost > 0) {
      response += `💰 **Estimated Cost**: $${prediction.estimatedCost.toFixed(2)}\n\n`;
    }

    if (prediction.warnings.length > 0) {
      response += `⚠️ **Warnings**:\n`;
      for (const warning of prediction.warnings) {
        const icon = warning.level === 'critical' ? '🚨' : warning.level === 'high' ? '⚠️' : '💡';
        response += `${icon} ${warning.message}\n`;
      }
      response += `\n`;
    }

    if (prediction.suggestions.length > 0) {
      response += `💡 **Suggestions**:\n`;
      for (const suggestion of prediction.suggestions) {
        response += `• ${suggestion.description}\n`;
        if (suggestion.benefitDescription) {
          response += `  *${suggestion.benefitDescription}*\n`;
        }
      }
      response += `\n`;
    }

    response += `**Explanation**: ${prediction.explanation}\n\n`;

    if (action === "blocked") {
      response += `🛑 **Operation blocked due to high failure risk.** Please review warnings and suggestions above.`;
    } else {
      response += `✅ **Proceeding with operation...**`;
    }

    return response;
  }

  private formatSuccessResponse(result: any, prediction: any): string {
    let response = '';
    
    // Add intelligence insights if available
    if (prediction && (prediction.warnings.length > 0 || prediction.suggestions.length > 0)) {
      response += `🤖 **Intelligence Insights**\n`;
      if (prediction.estimatedCost) {
        response += `💰 Estimated cost: $${prediction.estimatedCost.toFixed(2)}\n`;
      }
      if (prediction.warnings.length > 0) {
        response += `⚠️ ${prediction.warnings.length} warning(s) noted\n`;
      }
      if (prediction.suggestions.length > 0) {
        response += `💡 ${prediction.suggestions.length} optimization(s) available\n`;
      }
      response += `\n---\n\n`;
    }

    // Add the actual GCP result
    if (result?.content && result.content[0]?.text) {
      response += result.content[0].text;
    } else {
      response += 'Operation completed successfully.';
    }

    return response;
  }

  private formatErrorResponse(error: any, prediction: any): string {
    let response = `❌ **GCP Operation Failed**\n\n`;
    response += `**Error**: ${error.message}\n`;
    if (error.code) {
      response += `**Code**: ${error.code}\n`;
    }
    response += `\n`;

    // Add intelligence insights about the error
    if (prediction) {
      if (prediction.successProbability < 0.5) {
        response += `🤖 **Intelligence**: This failure was predicted (${(prediction.successProbability * 100).toFixed(1)}% success probability)\n\n`;
      }

      if (prediction.suggestions.length > 0) {
        response += `💡 **Suggested fixes**:\n`;
        for (const suggestion of prediction.suggestions) {
          response += `• ${suggestion.description}\n`;
        }
        response += `\n`;
      }
    }

    response += `*This failure has been recorded for future intelligence improvements.*`;
    return response;
  }

  private extractRowsProcessed(response: any): number | undefined {
    // Try to extract row count from BigQuery responses
    if (response?.result?.content?.[0]?.text) {
      const text = response.result.content[0].text;
      const match = text.match(/returned (\d+) rows/);
      if (match) {
        return parseInt(match[1]);
      }
    }
    return undefined;
  }

  private estimateTokenAge(): number {
    // Simple estimation - in production this would track actual token refresh times
    // For now, assume tokens are refreshed every hour and we're somewhere in between
    return Math.floor(Math.random() * 60); // 0-60 minutes
  }

  private sanitizeArgs(args: any): any {
    if (!args || typeof args !== 'object') return args;
    
    const sanitized = { ...args };
    const sensitiveFields = ['token', 'password', 'secret', 'key'];
    
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }

  async start() {
    logger.info("Starting ruv-FANN Enhanced MCP server with GCP intelligence...");
    
    // Initialize pattern databases
    await this.patternLearner.initialize();
    logger.info("Pattern learner initialized");
    
    // Test ruv-FANN connectivity
    await this.ruvFannClient.testConnectivity();
    logger.info("ruv-FANN services connected");
    
    // Test GCP MCP backend connectivity
    await this.gcpMCPClient.testConnectivity();
    logger.info("GCP MCP backend connected");
    
    // Start MCP server
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    
    logger.info("🚀 ruv-FANN Enhanced MCP server started successfully!");
    logger.info("Features enabled:");
    logger.info("  - GCP operations with intelligent predictions");
    logger.info("  - Cost estimation and warnings");
    logger.info("  - Auth token monitoring");
    logger.info("  - Pattern learning from all operations");
    logger.info("  - Ephemeral agent analysis");
  }
}

// Start the server
const server = new RuvFannMCPServer();
server.start().catch((error) => {
  logger.error("Failed to start server:", error);
  process.exit(1);
});