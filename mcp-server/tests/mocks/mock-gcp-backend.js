#!/usr/bin/env node

/**
 * Mock GCP Backend for Testing
 * 
 * Simulates BigQuery responses for testing the ruv-FANN MCP system
 * without requiring actual GCP credentials or incurring costs.
 */

import express from 'express';
import bodyParser from 'body-parser';

const app = express();
app.use(bodyParser.json());

const PORT = process.env.PORT || 8080;
const SECRET_TOKEN = process.env.MCP_SECRET || 'test-secret-token';

// Mock datasets and tables
const MOCK_DATA = {
  datasets: [
    { id: 'test_public_data', location: 'US' },
    { id: 'test_analytics', location: 'US' },
    { id: 'test_finance_data', location: 'US', restricted: true },
    { id: 'test_restricted_data', location: 'US', restricted: true }
  ],
  
  tables: {
    'test_public_data': [
      { name: 'customers', rows: 1000000, sizeGB: 5 },
      { name: 'orders', rows: 10000000, sizeGB: 50 },
      { name: 'products', rows: 50000, sizeGB: 0.5 }
    ],
    'test_analytics': [
      { name: 'events', rows: 1000000000, sizeGB: 1000 },
      { name: 'sessions', rows: 50000000, sizeGB: 100 },
      { name: 'pageviews', rows: 500000000, sizeGB: 500 }
    ],
    'test_finance_data': [
      { name: 'transactions', rows: 100000000, sizeGB: 200 },
      { name: 'salary_data', rows: 10000, sizeGB: 0.1, sensitive: true }
    ],
    'test_restricted_data': [
      { name: 'user_pii', rows: 1000000, sizeGB: 10, sensitive: true },
      { name: 'medical_records', rows: 500000, sizeGB: 50, sensitive: true }
    ]
  }
};

// Middleware to check auth token
function checkAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization header' });
  }
  
  const token = authHeader.substring(7);
  if (token !== SECRET_TOKEN) {
    return res.status(401).json({ error: 'Invalid token' });
  }
  
  next();
}

// Health check endpoint
app.get('/mcp', (req, res) => {
  res.json({ status: 'ok', service: 'mock-gcp-backend' });
});

// MCP endpoint
app.post('/mcp', checkAuth, async (req, res) => {
  const { method, params } = req.body;
  
  console.log('MCP Request:', method, params);
  
  try {
    let result;
    
    switch (method) {
      case 'tools/call':
        result = await handleToolCall(params);
        break;
        
      case 'tools/list':
        result = handleToolsList();
        break;
        
      default:
        return res.status(400).json({ 
          error: { message: `Unknown method: ${method}` }
        });
    }
    
    res.json({ result });
    
  } catch (error) {
    console.error('Error handling request:', error);
    res.status(500).json({ 
      error: { 
        message: error.message,
        code: error.code || 'INTERNAL_ERROR'
      }
    });
  }
});

async function handleToolCall(params) {
  const { name: toolName, arguments: args } = params;
  
  // Simulate processing delay
  await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 10));
  
  switch (toolName) {
    case 'gcp_sql':
    case 'bq_query':
      return handleBigQueryOperation(args);
      
    case 'bq_list_datasets':
      return handleListDatasets(args);
      
    case 'bq_list_tables':
      return handleListTables(args);
      
    case 'echo':
      return {
        content: [{
          type: 'text',
          text: `Echo: ${args.message}`
        }]
      };
      
    default:
      throw new Error(`Unknown tool: ${toolName}`);
  }
}

function handleToolsList() {
  return {
    tools: [
      { name: 'gcp_sql', description: 'Execute BigQuery SQL' },
      { name: 'bq_query', description: 'Execute BigQuery query' },
      { name: 'bq_list_datasets', description: 'List datasets' },
      { name: 'bq_list_tables', description: 'List tables in dataset' },
      { name: 'echo', description: 'Echo test' }
    ]
  };
}

function handleBigQueryOperation(args) {
  const { query, operation } = args;
  
  // Handle operations
  if (operation) {
    switch (operation) {
      case 'list-datasets':
        return handleListDatasets(args);
      case 'list-tables':
        return handleListTables(args);
      case 'describe-table':
        return handleDescribeTable(args);
      default:
        throw new Error(`Unknown operation: ${operation}`);
    }
  }
  
  // Handle SQL queries
  if (!query) {
    throw new Error('Query parameter required');
  }
  
  const queryLower = query.toLowerCase();
  
  // Simulate syntax errors
  if (!queryLower.includes('from') && queryLower.includes('where')) {
    throw new Error('Syntax error: Expected keyword FROM');
  }
  
  if (queryLower.includes('customer_name') && !queryLower.includes('from')) {
    throw new Error('Syntax error: Missing FROM clause');
  }
  
  // Simulate permission errors
  if (queryLower.includes('finance.salary_data') || 
      queryLower.includes('restricted') ||
      queryLower.includes('sensitive')) {
    throw new Error('Access Denied: User does not have bigquery.tables.getData permission');
  }
  
  // Simulate cross-region errors
  if (queryLower.includes('us-east1') && queryLower.includes('eu-west1')) {
    throw new Error('Cross-region query not allowed without proper permissions');
  }
  
  // Simulate expensive query warning (but allow execution)
  if (queryLower.includes('select *') && !queryLower.includes('limit')) {
    console.log('Warning: Query may scan large amount of data');
  }
  
  // Return mock results
  return {
    content: [{
      type: 'text',
      text: formatQueryResults(query)
    }]
  };
}

function handleListDatasets(args) {
  const datasets = MOCK_DATA.datasets
    .filter(d => !d.restricted || Math.random() > 0.5) // Randomly allow some restricted
    .map(d => ({
      datasetId: d.id,
      location: d.location,
      creationTime: new Date(Date.now() - Math.random() * 365 * 24 * 60 * 60 * 1000).toISOString()
    }));
  
  return {
    content: [{
      type: 'text',
      text: `Found ${datasets.length} datasets:\n` + 
            datasets.map(d => `- ${d.datasetId} (${d.location})`).join('\n')
    }]
  };
}

function handleListTables(args) {
  const { datasetId, dataset } = args;
  const targetDataset = datasetId || dataset;
  
  if (!targetDataset) {
    throw new Error('Dataset parameter required');
  }
  
  const tables = MOCK_DATA.tables[targetDataset];
  if (!tables) {
    throw new Error(`Dataset not found: ${targetDataset}`);
  }
  
  return {
    content: [{
      type: 'text',
      text: `Tables in ${targetDataset}:\n` +
            tables.map(t => `- ${t.name} (${t.rows.toLocaleString()} rows, ${t.sizeGB}GB)`).join('\n')
    }]
  };
}

function handleDescribeTable(args) {
  const { dataset, table } = args;
  
  if (!dataset || !table) {
    throw new Error('Dataset and table parameters required');
  }
  
  const tables = MOCK_DATA.tables[dataset];
  if (!tables) {
    throw new Error(`Dataset not found: ${dataset}`);
  }
  
  const tableInfo = tables.find(t => t.name === table);
  if (!tableInfo) {
    throw new Error(`Table not found: ${dataset}.${table}`);
  }
  
  return {
    content: [{
      type: 'text',
      text: `Table: ${dataset}.${table}
Rows: ${tableInfo.rows.toLocaleString()}
Size: ${tableInfo.sizeGB}GB
Schema:
- id: INTEGER
- created_at: TIMESTAMP
- updated_at: TIMESTAMP
${tableInfo.sensitive ? '- [Additional columns hidden - sensitive data]' : '- data: STRING'}`
    }]
  };
}

function formatQueryResults(query) {
  // Generate mock results based on query
  if (query.toLowerCase().includes('count(*)')) {
    return `Query completed successfully. 
Total rows: 1
Results:
┌─────────┐
│ count   │
├─────────┤
│ 42,567  │
└─────────┘`;
  }
  
  if (query.toLowerCase().includes('limit')) {
    const limitMatch = query.match(/limit\s+(\d+)/i);
    const limit = limitMatch ? parseInt(limitMatch[1]) : 10;
    
    return `Query completed successfully.
Total rows returned: ${limit}
Results:
┌──────────┬──────────────┬─────────┐
│ id       │ name         │ status  │
├──────────┼──────────────┼─────────┤
${Array(Math.min(limit, 3)).fill(0).map((_, i) => 
  `│ ${String(1000 + i).padEnd(8)} │ Customer ${String(i + 1).padEnd(4)} │ active  │`
).join('\n')}
└──────────┴──────────────┴─────────┘
${limit > 3 ? `... and ${limit - 3} more rows` : ''}`;
  }
  
  return 'Query completed successfully. Returned 0 rows.';
}

// Start server
app.listen(PORT, () => {
  console.log(`Mock GCP Backend running on port ${PORT}`);
  console.log(`Secret token: ${SECRET_TOKEN}`);
  console.log('Available endpoints:');
  console.log(`  GET  http://localhost:${PORT}/mcp (health check)`);
  console.log(`  POST http://localhost:${PORT}/mcp (MCP operations)`);
});