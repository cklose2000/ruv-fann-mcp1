#!/usr/bin/env node

// Simple test script for MCP server
// This simulates MCP protocol messages to test the server

import { spawn } from 'child_process';

const messages = [
  // List available tools
  {
    jsonrpc: "2.0",
    id: 1,
    method: "tools/list",
    params: {}
  },
  
  // Test prediction
  {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/call",
    params: {
      name: "predict_outcome",
      arguments: {
        tool: "bq query",
        params: {
          query: "SELECT * FROM bigquery-public-data.samples.shakespeare",
          use_legacy_sql: false
        },
        context: {
          projectType: "data-analysis"
        }
      }
    }
  },
  
  // Record a learning example
  {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "learn_pattern",
      arguments: {
        tool: "bq query",
        params: {
          query: "SELECT * FROM huge_table",
          use_legacy_sql: false
        },
        outcome: "failure",
        duration: 30000,
        error: "Query exceeded resource limits"
      }
    }
  },
  
  // Get suggestions
  {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "get_suggestions",
      arguments: {
        tool: "git push",
        params: { branch: "main" },
        goal: "Push changes to remote"
      }
    }
  }
];

async function testMCPServer() {
  console.log("Starting MCP server test...\n");
  
  // Spawn MCP server
  const server = spawn('node', ['dist/index.js'], {
    cwd: process.cwd(),
    stdio: ['pipe', 'pipe', 'pipe']
  });
  
  let buffer = '';
  
  server.stdout.on('data', (data) => {
    buffer += data.toString();
    
    // Try to parse complete JSON messages
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    
    for (const line of lines) {
      if (line.trim()) {
        try {
          const response = JSON.parse(line);
          console.log('Response:', JSON.stringify(response, null, 2));
          console.log('---');
        } catch (e) {
          console.log('Server output:', line);
        }
      }
    }
  });
  
  server.stderr.on('data', (data) => {
    console.error('Server error:', data.toString());
  });
  
  server.on('error', (error) => {
    console.error('Failed to start server:', error);
  });
  
  // Send test messages
  for (const message of messages) {
    console.log('Sending:', message.method);
    server.stdin.write(JSON.stringify(message) + '\n');
    
    // Wait a bit between messages
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Wait for final responses
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Clean shutdown
  server.kill();
  console.log('\nTest completed');
}

testMCPServer().catch(console.error);