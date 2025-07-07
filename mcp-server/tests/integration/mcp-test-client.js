#!/usr/bin/env node

/**
 * MCP Test Client for ruv-FANN MCP Server
 * 
 * Simulates Claude's MCP protocol calls for comprehensive testing
 * of the BigQuery prediction system.
 */

import net from 'net';
import { EventEmitter } from 'events';

export class MCPTestClient extends EventEmitter {
  constructor(options = {}) {
    super();
    this.serverPath = options.serverPath || '/home/cklose/ruv-fann-mcp1/mcp-server/dist/index.js';
    this.env = options.env || {
      RUV_FANN_CORE_URL: 'http://127.0.0.1:8090',
      RUV_FANN_SWARM_URL: 'http://127.0.0.1:8081',
      RUV_FANN_MODEL_URL: 'http://127.0.0.1:8082',
      GCP_MCP_BACKEND_URL: 'http://127.0.0.1:8080',
      GCP_MCP_SECRET: 'test-secret-token'
    };
    
    this.messageId = 0;
    this.pendingRequests = new Map();
    this.serverProcess = null;
    this.connection = null;
    this.buffer = '';
  }

  async connect() {
    // Start the MCP server as a subprocess
    const { spawn } = await import('child_process');
    
    this.serverProcess = spawn('node', [this.serverPath], {
      env: { ...process.env, ...this.env },
      stdio: ['pipe', 'pipe', 'pipe']
    });

    // Set up stdio communication
    this.setupStdioHandlers();
    
    // Wait for server to be ready
    await this.waitForReady();
    
    this.emit('connected');
  }

  setupStdioHandlers() {
    // Handle server stdout (MCP responses)
    this.serverProcess.stdout.on('data', (data) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    // Handle server stderr (logs)
    this.serverProcess.stderr.on('data', (data) => {
      console.error('[MCP Server]', data.toString());
    });

    // Handle server exit
    this.serverProcess.on('exit', (code) => {
      this.emit('disconnected', code);
      this.cleanup();
    });
  }

  processBuffer() {
    // MCP uses line-delimited JSON
    const lines = this.buffer.split('\n');
    this.buffer = lines.pop() || '';

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          this.handleMessage(message);
        } catch (error) {
          console.error('Failed to parse MCP message:', line, error);
        }
      }
    }
  }

  handleMessage(message) {
    // Handle MCP protocol messages
    if (message.id && this.pendingRequests.has(message.id)) {
      const { resolve, reject } = this.pendingRequests.get(message.id);
      this.pendingRequests.delete(message.id);

      if (message.error) {
        reject(new Error(message.error.message));
      } else {
        resolve(message.result);
      }
    } else if (message.method) {
      // Handle server-initiated messages (notifications)
      this.emit('notification', message);
    }
  }

  async sendRequest(method, params = {}) {
    const id = ++this.messageId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      
      // Send request to server stdin
      this.serverProcess.stdin.write(JSON.stringify(request) + '\n');
      
      // Set timeout
      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id);
          reject(new Error('Request timeout'));
        }
      }, 30000); // 30 second timeout
    });
  }

  async waitForReady() {
    // Wait for server to initialize
    let retries = 0;
    while (retries < 50) { // 5 seconds max
      try {
        const tools = await this.listTools();
        if (tools && tools.length > 0) {
          return;
        }
      } catch (error) {
        // Server not ready yet
      }
      await new Promise(resolve => setTimeout(resolve, 100));
      retries++;
    }
    throw new Error('MCP server failed to start');
  }

  // MCP Protocol Methods

  async listTools() {
    const result = await this.sendRequest('tools/list');
    return result.tools;
  }

  async callTool(toolName, args = {}) {
    const startTime = Date.now();
    
    const result = await this.sendRequest('tools/call', {
      name: toolName,
      arguments: args
    });
    
    const endTime = Date.now();
    const duration = endTime - startTime;
    
    // Extract prediction info if available
    const response = {
      result: result.content?.[0]?.text || result,
      duration,
      toolName,
      args
    };

    // Parse intelligence insights if present
    if (typeof response.result === 'string') {
      response.prediction = this.parsePredictionFromResponse(response.result);
    }

    return response;
  }

  parsePredictionFromResponse(text) {
    const prediction = {
      successProbability: null,
      confidence: null,
      warnings: [],
      suggestions: [],
      estimatedCost: null,
      blocked: false
    };

    // Extract success probability
    const probMatch = text.match(/Success Probability[:\s]+(\d+\.?\d*)%/);
    if (probMatch) {
      prediction.successProbability = parseFloat(probMatch[1]) / 100;
    }

    // Extract confidence
    const confMatch = text.match(/Confidence[:\s]+(\d+\.?\d*)%/);
    if (confMatch) {
      prediction.confidence = parseFloat(confMatch[1]) / 100;
    }

    // Extract estimated cost
    const costMatch = text.match(/Estimated Cost[:\s]+\$(\d+\.?\d*)/);
    if (costMatch) {
      prediction.estimatedCost = parseFloat(costMatch[1]);
    }

    // Check if blocked
    prediction.blocked = text.includes('Operation blocked');

    // Extract warnings
    const warningSection = text.match(/Warnings[:\s]*\n([\s\S]*?)(?=\n\n|$)/);
    if (warningSection) {
      const warningLines = warningSection[1].split('\n').filter(line => line.trim());
      prediction.warnings = warningLines.map(line => line.replace(/^[🚨⚠️💡]\s*/, '').trim());
    }

    return prediction;
  }

  async listResources() {
    const result = await this.sendRequest('resources/list');
    return result.resources;
  }

  async readResource(uri) {
    const result = await this.sendRequest('resources/read', { uri });
    return result.contents?.[0];
  }

  // Convenience methods for testing

  async predictOutcome(tool, params, context = {}) {
    return this.callTool('predict_outcome', {
      tool,
      params,
      context
    });
  }

  async learnPattern(tool, params, outcome, duration, error = null) {
    return this.callTool('learn_pattern', {
      tool,
      params,
      outcome,
      duration,
      error
    });
  }

  async getSuggestions(tool, params, goal = '') {
    return this.callTool('get_suggestions', {
      tool,
      params,
      goal
    });
  }

  // BigQuery-specific tool calls

  async executeBigQuery(query, options = {}) {
    return this.callTool('gcp-sql', {
      query,
      ...options
    });
  }

  async listDatasets(projectId = null) {
    return this.callTool('gcp-sql', {
      operation: 'list-datasets',
      projectId
    });
  }

  async listTables(dataset, projectId = null) {
    return this.callTool('gcp-sql', {
      operation: 'list-tables',
      dataset,
      projectId
    });
  }

  async getTableSchema(dataset, table, projectId = null) {
    return this.callTool('gcp-sql', {
      operation: 'describe-table',
      dataset,
      table,
      projectId
    });
  }

  // Cleanup

  async disconnect() {
    this.cleanup();
  }

  cleanup() {
    if (this.serverProcess) {
      this.serverProcess.kill();
      this.serverProcess = null;
    }
    
    // Clear pending requests
    for (const [id, { reject }] of this.pendingRequests) {
      reject(new Error('Client disconnected'));
    }
    this.pendingRequests.clear();
  }
}

// Example usage for testing
if (import.meta.url === `file://${process.argv[1]}`) {
  async function testClient() {
    const client = new MCPTestClient();
    
    try {
      console.log('Connecting to MCP server...');
      await client.connect();
      console.log('Connected!');
      
      // List available tools
      console.log('\nAvailable tools:');
      const tools = await client.listTools();
      console.log(tools.map(t => t.name).join(', '));
      
      // Test prediction
      console.log('\nTesting BigQuery prediction:');
      const prediction = await client.executeBigQuery(
        'SELECT * FROM production.billion_row_table'
      );
      console.log('Response:', prediction);
      
      // Test with syntax error
      console.log('\nTesting syntax error detection:');
      const syntaxTest = await client.executeBigQuery(
        'SELECT customer_id FROM WHERE active = true'
      );
      console.log('Response:', syntaxTest);
      
    } catch (error) {
      console.error('Test failed:', error);
    } finally {
      await client.disconnect();
    }
  }
  
  testClient();
}

export default MCPTestClient;