#!/usr/bin/env node

import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Real-time Metrics Dashboard for ruv-FANN Enhanced MCP Server
 * Provides live monitoring of test results, prediction accuracy, and system performance
 */
class MetricsDashboard {
  constructor(port = 3456) {
    this.port = port;
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = new Server(this.server);
    this.reportDir = path.join(__dirname, '..', '..', 'test-reports');
    this.metricsHistory = [];
    this.liveMetrics = {
      predictions: {
        total: 0,
        successful: 0,
        failed: 0,
        avgLatency: 0,
        recentLatencies: [],
      },
      patterns: {
        totalStored: 0,
        recentlyAdded: 0,
        successRate: 0,
      },
      system: {
        memory: 0,
        cpu: 0,
        uptime: 0,
      },
    };
  }

  async start() {
    console.log('🚀 Starting Metrics Dashboard...\n');
    
    // Setup routes
    this.setupRoutes();
    
    // Setup WebSocket connections
    this.setupWebSocket();
    
    // Start monitoring
    this.startMonitoring();
    
    // Start server
    this.server.listen(this.port, () => {
      console.log(`📊 Metrics Dashboard running at http://localhost:${this.port}`);
      console.log('Press Ctrl+C to stop\n');
    });
  }

  setupRoutes() {
    // Serve static files
    this.app.use(express.static(path.join(__dirname, 'public')));
    
    // API endpoints
    this.app.get('/api/metrics/current', (req, res) => {
      res.json(this.liveMetrics);
    });
    
    this.app.get('/api/metrics/history', (req, res) => {
      res.json(this.metricsHistory);
    });
    
    this.app.get('/api/reports/latest', (req, res) => {
      const latestReport = this.getLatestReport();
      res.json(latestReport);
    });
    
    this.app.get('/api/tests/results', (req, res) => {
      const results = this.getTestResults();
      res.json(results);
    });
    
    // Main dashboard page
    this.app.get('/', (req, res) => {
      res.send(this.generateDashboardHTML());
    });
  }

  setupWebSocket() {
    this.io.on('connection', (socket) => {
      console.log('Client connected to dashboard');
      
      // Send current metrics immediately
      socket.emit('metrics:update', this.liveMetrics);
      
      // Send historical data
      socket.emit('metrics:history', this.metricsHistory);
      
      socket.on('disconnect', () => {
        console.log('Client disconnected from dashboard');
      });
    });
  }

  startMonitoring() {
    // Update metrics every second
    setInterval(() => {
      this.updateLiveMetrics();
      this.io.emit('metrics:update', this.liveMetrics);
    }, 1000);
    
    // Update history every 10 seconds
    setInterval(() => {
      this.updateMetricsHistory();
    }, 10000);
    
    // Run live tests every 30 seconds
    setInterval(() => {
      this.runLiveTest();
    }, 30000);
  }

  updateLiveMetrics() {
    // Update system metrics
    const usage = process.memoryUsage();
    this.liveMetrics.system = {
      memory: Math.round(usage.heapUsed / 1024 / 1024),
      cpu: process.cpuUsage().user / 1000000, // Convert to seconds
      uptime: process.uptime(),
    };
    
    // Calculate average latency
    if (this.liveMetrics.predictions.recentLatencies.length > 0) {
      const sum = this.liveMetrics.predictions.recentLatencies.reduce((a, b) => a + b, 0);
      this.liveMetrics.predictions.avgLatency = sum / this.liveMetrics.predictions.recentLatencies.length;
      
      // Keep only last 100 latencies
      if (this.liveMetrics.predictions.recentLatencies.length > 100) {
        this.liveMetrics.predictions.recentLatencies = 
          this.liveMetrics.predictions.recentLatencies.slice(-100);
      }
    }
  }

  updateMetricsHistory() {
    const snapshot = {
      timestamp: Date.now(),
      predictions: { ...this.liveMetrics.predictions },
      patterns: { ...this.liveMetrics.patterns },
      system: { ...this.liveMetrics.system },
    };
    
    this.metricsHistory.push(snapshot);
    
    // Keep only last hour of history
    const oneHourAgo = Date.now() - 3600000;
    this.metricsHistory = this.metricsHistory.filter(m => m.timestamp > oneHourAgo);
    
    // Emit to connected clients
    this.io.emit('metrics:history:update', snapshot);
  }

  async runLiveTest() {
    console.log('Running live test...');
    
    const startTime = Date.now();
    
    try {
      // Run a simple prediction test
      const testProcess = spawn('node', [
        path.join(__dirname, '..', '..', 'dist', 'tests', 'utils', 'live-test.js'),
      ]);
      
      testProcess.on('close', (code) => {
        const duration = Date.now() - startTime;
        
        if (code === 0) {
          this.liveMetrics.predictions.successful++;
          this.liveMetrics.predictions.total++;
          this.liveMetrics.predictions.recentLatencies.push(duration);
        } else {
          this.liveMetrics.predictions.failed++;
          this.liveMetrics.predictions.total++;
        }
        
        console.log(`Live test completed in ${duration}ms`);
      });
    } catch (error) {
      console.error('Live test failed:', error);
      this.liveMetrics.predictions.failed++;
      this.liveMetrics.predictions.total++;
    }
  }

  getLatestReport() {
    const reportPath = path.join(this.reportDir, 'comprehensive-report.json');
    
    if (fs.existsSync(reportPath)) {
      return JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    }
    
    return null;
  }

  getTestResults() {
    const results = [];
    const resultsPattern = /.*-results\.json$/;
    
    if (!fs.existsSync(this.reportDir)) {
      return results;
    }
    
    const files = fs.readdirSync(this.reportDir);
    
    files.forEach(file => {
      if (resultsPattern.test(file)) {
        const filePath = path.join(this.reportDir, file);
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        results.push({
          suite: file.replace('-results.json', ''),
          ...data,
        });
      }
    });
    
    return results;
  }

  generateDashboardHTML() {
    return `
<!DOCTYPE html>
<html>
<head>
  <title>ruv-FANN MCP Metrics Dashboard</title>
  <script src="https://cdn.socket.io/4.5.0/socket.io.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0e27;
      color: #e0e0e0;
      line-height: 1.6;
    }
    .header {
      background: linear-gradient(135deg, #1e3c72 0%, #2a5298 100%);
      padding: 20px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.3);
    }
    .header h1 {
      font-size: 28px;
      font-weight: 300;
      letter-spacing: 1px;
    }
    .header .status {
      display: inline-block;
      padding: 5px 15px;
      background: #4CAF50;
      border-radius: 20px;
      font-size: 14px;
      margin-left: 20px;
    }
    .container {
      max-width: 1400px;
      margin: 0 auto;
      padding: 20px;
    }
    .metrics-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 20px;
      margin-bottom: 30px;
    }
    .metric-card {
      background: #1a1f3a;
      border-radius: 10px;
      padding: 20px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      border: 1px solid #2a3f5f;
      transition: transform 0.2s;
    }
    .metric-card:hover {
      transform: translateY(-2px);
      box-shadow: 0 6px 12px rgba(0,0,0,0.2);
    }
    .metric-card h3 {
      font-size: 14px;
      color: #8b92a8;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 10px;
    }
    .metric-value {
      font-size: 36px;
      font-weight: 700;
      color: #4fc3f7;
      margin-bottom: 5px;
    }
    .metric-change {
      font-size: 14px;
      color: #8b92a8;
    }
    .metric-change.positive { color: #4CAF50; }
    .metric-change.negative { color: #f44336; }
    .chart-container {
      background: #1a1f3a;
      border-radius: 10px;
      padding: 20px;
      margin-bottom: 20px;
      border: 1px solid #2a3f5f;
    }
    .chart-container h2 {
      font-size: 18px;
      margin-bottom: 20px;
      color: #e0e0e0;
    }
    #latencyChart, #systemChart {
      max-height: 300px;
    }
    .test-results {
      background: #1a1f3a;
      border-radius: 10px;
      padding: 20px;
      border: 1px solid #2a3f5f;
    }
    .test-results table {
      width: 100%;
      border-collapse: collapse;
    }
    .test-results th {
      background: #2a3f5f;
      padding: 10px;
      text-align: left;
      font-weight: 500;
      color: #8b92a8;
      text-transform: uppercase;
      font-size: 12px;
      letter-spacing: 1px;
    }
    .test-results td {
      padding: 10px;
      border-bottom: 1px solid #2a3f5f;
    }
    .test-results tr:hover {
      background: rgba(79, 195, 247, 0.05);
    }
    .success { color: #4CAF50; }
    .failure { color: #f44336; }
    .warning { color: #ff9800; }
    .live-indicator {
      display: inline-block;
      width: 8px;
      height: 8px;
      background: #4CAF50;
      border-radius: 50%;
      animation: pulse 2s infinite;
      margin-right: 5px;
    }
    @keyframes pulse {
      0% { opacity: 1; }
      50% { opacity: 0.5; }
      100% { opacity: 1; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="container">
      <h1>
        <span class="live-indicator"></span>
        ruv-FANN MCP Metrics Dashboard
        <span class="status">LIVE</span>
      </h1>
    </div>
  </div>
  
  <div class="container">
    <div class="metrics-grid">
      <div class="metric-card">
        <h3>Total Predictions</h3>
        <div class="metric-value" id="totalPredictions">0</div>
        <div class="metric-change" id="predictionRate">0 per minute</div>
      </div>
      
      <div class="metric-card">
        <h3>Success Rate</h3>
        <div class="metric-value" id="successRate">0%</div>
        <div class="metric-change" id="successTrend">stable</div>
      </div>
      
      <div class="metric-card">
        <h3>Avg Latency</h3>
        <div class="metric-value" id="avgLatency">0ms</div>
        <div class="metric-change" id="latencyTrend">stable</div>
      </div>
      
      <div class="metric-card">
        <h3>Memory Usage</h3>
        <div class="metric-value" id="memoryUsage">0MB</div>
        <div class="metric-change" id="memoryTrend">stable</div>
      </div>
    </div>
    
    <div class="chart-container">
      <h2>Prediction Latency (Last 100)</h2>
      <canvas id="latencyChart"></canvas>
    </div>
    
    <div class="chart-container">
      <h2>System Resources</h2>
      <canvas id="systemChart"></canvas>
    </div>
    
    <div class="test-results">
      <h2>Recent Test Results</h2>
      <table id="testResultsTable">
        <thead>
          <tr>
            <th>Suite</th>
            <th>Total</th>
            <th>Passed</th>
            <th>Failed</th>
            <th>Duration</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          <!-- Populated by JavaScript -->
        </tbody>
      </table>
    </div>
  </div>
  
  <script>
    const socket = io();
    
    // Chart setup
    const latencyCtx = document.getElementById('latencyChart').getContext('2d');
    const latencyChart = new Chart(latencyCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Latency (ms)',
          data: [],
          borderColor: '#4fc3f7',
          backgroundColor: 'rgba(79, 195, 247, 0.1)',
          borderWidth: 2,
          tension: 0.4,
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: false },
          y: {
            beginAtZero: true,
            grid: { color: '#2a3f5f' },
            ticks: { color: '#8b92a8' }
          }
        }
      }
    });
    
    const systemCtx = document.getElementById('systemChart').getContext('2d');
    const systemChart = new Chart(systemCtx, {
      type: 'line',
      data: {
        labels: [],
        datasets: [{
          label: 'Memory (MB)',
          data: [],
          borderColor: '#66bb6a',
          backgroundColor: 'rgba(102, 187, 106, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          yAxisID: 'y',
        }, {
          label: 'CPU (s)',
          data: [],
          borderColor: '#ffa726',
          backgroundColor: 'rgba(255, 167, 38, 0.1)',
          borderWidth: 2,
          tension: 0.4,
          yAxisID: 'y1',
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'index',
          intersect: false,
        },
        plugins: {
          legend: {
            labels: { color: '#8b92a8' }
          }
        },
        scales: {
          x: { display: false },
          y: {
            type: 'linear',
            display: true,
            position: 'left',
            grid: { color: '#2a3f5f' },
            ticks: { color: '#8b92a8' }
          },
          y1: {
            type: 'linear',
            display: true,
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#8b92a8' }
          }
        }
      }
    });
    
    // Update metrics
    socket.on('metrics:update', (metrics) => {
      // Update cards
      document.getElementById('totalPredictions').textContent = metrics.predictions.total;
      
      const successRate = metrics.predictions.total > 0 
        ? ((metrics.predictions.successful / metrics.predictions.total) * 100).toFixed(1)
        : 0;
      document.getElementById('successRate').textContent = successRate + '%';
      
      document.getElementById('avgLatency').textContent = 
        metrics.predictions.avgLatency.toFixed(0) + 'ms';
      
      document.getElementById('memoryUsage').textContent = 
        metrics.system.memory + 'MB';
      
      // Update latency chart
      if (metrics.predictions.recentLatencies.length > 0) {
        const latestLatency = metrics.predictions.recentLatencies[metrics.predictions.recentLatencies.length - 1];
        latencyChart.data.labels.push(new Date().toLocaleTimeString());
        latencyChart.data.datasets[0].data.push(latestLatency);
        
        if (latencyChart.data.labels.length > 100) {
          latencyChart.data.labels.shift();
          latencyChart.data.datasets[0].data.shift();
        }
        
        latencyChart.update('none');
      }
    });
    
    // Update history
    socket.on('metrics:history:update', (snapshot) => {
      // Update system chart
      systemChart.data.labels.push(new Date(snapshot.timestamp).toLocaleTimeString());
      systemChart.data.datasets[0].data.push(snapshot.system.memory);
      systemChart.data.datasets[1].data.push(snapshot.system.cpu.toFixed(2));
      
      if (systemChart.data.labels.length > 60) {
        systemChart.data.labels.shift();
        systemChart.data.datasets[0].data.shift();
        systemChart.data.datasets[1].data.shift();
      }
      
      systemChart.update('none');
    });
    
    // Load test results
    fetch('/api/tests/results')
      .then(res => res.json())
      .then(results => {
        const tbody = document.querySelector('#testResultsTable tbody');
        tbody.innerHTML = '';
        
        results.forEach(result => {
          const row = tbody.insertRow();
          row.innerHTML = \`
            <td>\${result.suite}</td>
            <td>\${result.numTotalTests || 0}</td>
            <td class="success">\${result.numPassedTests || 0}</td>
            <td class="\${result.numFailedTests > 0 ? 'failure' : ''}">\${result.numFailedTests || 0}</td>
            <td>\${result.testResults?.[0]?.perfStats?.runtime ? (result.testResults[0].perfStats.runtime / 1000).toFixed(2) + 's' : 'N/A'}</td>
            <td class="\${result.success ? 'success' : 'failure'}">\${result.success ? 'PASSED' : 'FAILED'}</td>
          \`;
        });
      });
    
    // Auto-refresh test results every 30 seconds
    setInterval(() => {
      location.reload();
    }, 30000);
  </script>
</body>
</html>
    `;
  }
}

// CLI interface
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dashboard = new MetricsDashboard(process.env.PORT || 3456);
  dashboard.start().catch(console.error);
  
  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down dashboard...');
    process.exit(0);
  });
}