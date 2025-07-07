#!/usr/bin/env node

/**
 * Test script for ruv-FANN Enhanced MCP Server
 * This script simulates MCP client interactions to verify the server works correctly
 */

import { spawn } from 'child_process';
import readline from 'readline';

// ANSI color codes
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

// Helper to print colored output
function log(message, color = '') {
  console.log(`${color}${message}${colors.reset}`);
}

// Create readline interface for interactive testing
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Test messages for MCP protocol
const testMessages = {
  initialize: {
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "0.1.0",
      capabilities: {
        tools: {}
      },
      clientInfo: {
        name: "test-client",
        version: "1.0.0"
      }
    }
  },
  
  listTools: {
    jsonrpc: "2.0",
    id: 2,
    method: "tools/list",
    params: {}
  },
  
  predictOutcome: {
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: {
      name: "predict_outcome",
      arguments: {
        tool: "bq-query",
        params: {
          query: "SELECT * FROM dataset.table LIMIT 10",
          projectId: "test-project"
        }
      }
    }
  },
  
  gcpListDatasets: {
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: {
      name: "bq-list-datasets",
      arguments: {
        projectId: "test-project"
      }
    }
  }
};

// Start the MCP server
log('\n🚀 Starting ruv-FANN Enhanced MCP Server Test...', colors.bright + colors.cyan);

const serverProcess = spawn('node', ['dist/index.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    RUV_FANN_CORE_URL: process.env.RUV_FANN_CORE_URL || 'http://127.0.0.1:8090',
    RUV_FANN_SWARM_URL: process.env.RUV_FANN_SWARM_URL || 'http://127.0.0.1:8081',
    RUV_FANN_MODEL_URL: process.env.RUV_FANN_MODEL_URL || 'http://127.0.0.1:8082',
    GCP_MCP_BACKEND_URL: process.env.GCP_MCP_BACKEND_URL || 'http://127.0.0.1:8080',
    GCP_MCP_SECRET: process.env.GCP_MCP_SECRET || 'test-secret'
  }
});

// Handle server output
let buffer = '';
serverProcess.stdout.on('data', (data) => {
  buffer += data.toString();
  
  // Try to parse complete JSON-RPC messages
  const lines = buffer.split('\n');
  buffer = lines.pop() || ''; // Keep incomplete line in buffer
  
  lines.forEach(line => {
    if (line.trim()) {
      try {
        const response = JSON.parse(line);
        handleResponse(response);
      } catch (e) {
        // Not JSON, probably log output
        if (line.includes('ERROR') || line.includes('error')) {
          log(`Server: ${line}`, colors.red);
        } else if (line.includes('WARN')) {
          log(`Server: ${line}`, colors.yellow);
        } else {
          log(`Server: ${line}`, colors.blue);
        }
      }
    }
  });
});

serverProcess.stderr.on('data', (data) => {
  log(`Server Error: ${data}`, colors.red);
});

serverProcess.on('close', (code) => {
  log(`\nServer exited with code ${code}`, code === 0 ? colors.green : colors.red);
  rl.close();
  process.exit(code || 0);
});

// Handle server responses
function handleResponse(response) {
  log('\n📥 Response received:', colors.green);
  console.log(JSON.stringify(response, null, 2));
  
  if (response.id === 1 && response.result) {
    log('\n✅ Server initialized successfully!', colors.bright + colors.green);
    showMenu();
  }
}

// Send message to server
function sendMessage(message) {
  log('\n📤 Sending message:', colors.yellow);
  console.log(JSON.stringify(message, null, 2));
  serverProcess.stdin.write(JSON.stringify(message) + '\n');
}

// Show interactive menu
function showMenu() {
  log('\n🎮 Interactive Test Menu:', colors.bright + colors.cyan);
  log('1. List all tools', colors.cyan);
  log('2. Test outcome prediction', colors.cyan);
  log('3. Test GCP operation (list datasets)', colors.cyan);
  log('4. Send custom message', colors.cyan);
  log('5. Exit', colors.cyan);
  
  rl.question('\nSelect an option (1-5): ', (answer) => {
    switch (answer) {
      case '1':
        sendMessage(testMessages.listTools);
        setTimeout(showMenu, 2000);
        break;
      case '2':
        sendMessage(testMessages.predictOutcome);
        setTimeout(showMenu, 2000);
        break;
      case '3':
        sendMessage(testMessages.gcpListDatasets);
        setTimeout(showMenu, 2000);
        break;
      case '4':
        rl.question('Enter JSON message: ', (json) => {
          try {
            const message = JSON.parse(json);
            sendMessage(message);
          } catch (e) {
            log('Invalid JSON!', colors.red);
          }
          setTimeout(showMenu, 2000);
        });
        break;
      case '5':
        log('\n👋 Goodbye!', colors.bright + colors.green);
        serverProcess.kill();
        break;
      default:
        log('Invalid option!', colors.red);
        showMenu();
    }
  });
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  log('\n\n🛑 Shutting down...', colors.yellow);
  serverProcess.kill();
});

// Start by initializing the server
setTimeout(() => {
  log('\n📡 Initializing MCP connection...', colors.cyan);
  sendMessage(testMessages.initialize);
}, 1000);

// Instructions
log('\n📖 Test Instructions:', colors.bright);
log('1. Make sure all backend services are running (ruv-FANN and gcp-fresh-mcp)', colors.yellow);
log('2. The server will start and you can interact with it through the menu', colors.yellow);
log('3. Watch for intelligence predictions and warnings in the responses', colors.yellow);
log('4. Press Ctrl+C to exit\n', colors.yellow);