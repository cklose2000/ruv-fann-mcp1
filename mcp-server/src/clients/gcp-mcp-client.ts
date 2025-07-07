import axios, { AxiosInstance } from 'axios';
import winston from 'winston';

export interface GCPMCPResponse {
  jsonrpc: string;
  id: string | number;
  result?: {
    content: Array<{
      type: string;
      text: string;
    }>;
  };
  error?: {
    code: number;
    message: string;
    data?: any;
  };
}

export class GCPMCPClient {
  private httpClient: AxiosInstance;
  private logger: winston.Logger;
  private baseUrl: string;
  private secretToken: string;

  constructor(config: {
    baseUrl: string;
    secretToken: string;
    timeout?: number;
  }) {
    this.baseUrl = config.baseUrl;
    this.secretToken = config.secretToken;

    this.httpClient = axios.create({
      baseURL: this.baseUrl,
      timeout: config.timeout || 30000,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.secretToken}`,
      },
    });

    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.File({ filename: 'gcp-mcp-client.log' }),
      ],
    });
  }

  async testConnectivity(): Promise<boolean> {
    try {
      const response = await this.httpClient.get('/mcp');
      this.logger.info('GCP MCP connectivity test successful', { 
        status: response.status,
        serverName: response.data?.name 
      });
      return true;
    } catch (error: any) {
      this.logger.error('GCP MCP connectivity test failed', { error: error.message });
      throw new Error(`Failed to connect to GCP MCP server at ${this.baseUrl}: ${error.message}`);
    }
  }

  async callTool(toolName: string, params: any): Promise<GCPMCPResponse> {
    const startTime = Date.now();
    
    try {
      const request = {
        jsonrpc: "2.0",
        method: "tools/call",
        params: {
          name: toolName,
          arguments: params
        },
        id: `ruv-fann-${Date.now()}`
      };

      this.logger.info('Calling GCP tool', { 
        toolName, 
        params: this.sanitizeParams(params) 
      });

      const response = await this.httpClient.post('/mcp', request);
      const duration = Date.now() - startTime;

      this.logger.info('GCP tool call completed', { 
        toolName, 
        duration,
        success: !response.data.error 
      });

      if (response.data.error) {
        this.logger.warn('GCP tool returned error', {
          toolName,
          error: response.data.error
        });
      }

      return response.data;
    } catch (error: any) {
      const duration = Date.now() - startTime;
      this.logger.error('GCP tool call failed', { 
        toolName, 
        duration,
        error: error.message 
      });
      throw new Error(`GCP tool call failed: ${error.message}`);
    }
  }

  async listTools(): Promise<any[]> {
    try {
      const request = {
        jsonrpc: "2.0",
        method: "tools/list",
        params: {},
        id: `ruv-fann-list-${Date.now()}`
      };

      const response = await this.httpClient.post('/mcp', request);
      
      if (response.data.error) {
        throw new Error(`Failed to list tools: ${response.data.error.message}`);
      }

      return response.data.result?.tools || [];
    } catch (error: any) {
      this.logger.error('Failed to list GCP tools', { error: error.message });
      throw error;
    }
  }

  // Sanitize parameters for logging (remove sensitive data)
  private sanitizeParams(params: any): any {
    if (!params || typeof params !== 'object') {
      return params;
    }

    const sanitized = { ...params };
    
    // Remove potential sensitive fields
    const sensitiveFields = ['token', 'password', 'secret', 'key', 'credential'];
    for (const field of sensitiveFields) {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    }

    return sanitized;
  }

  // Helper method to check if a tool is available
  async isToolAvailable(toolName: string): Promise<boolean> {
    try {
      const tools = await this.listTools();
      return tools.some(tool => tool.name === toolName);
    } catch (error: any) {
      this.logger.warn('Failed to check tool availability', { toolName, error: error.message });
      return false;
    }
  }

  // Get server info
  async getServerInfo(): Promise<any> {
    try {
      const request = {
        jsonrpc: "2.0",
        method: "initialize",
        params: { protocolVersion: "2025-03-26" },
        id: `ruv-fann-init-${Date.now()}`
      };

      const response = await this.httpClient.post('/mcp', request);
      return response.data.result?.serverInfo;
    } catch (error: any) {
      this.logger.error('Failed to get server info', { error: error.message });
      throw error;
    }
  }
}