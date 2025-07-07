#!/usr/bin/env node

/**
 * Test Results Dashboard for ruv-FANN MCP
 * 
 * Real-time visualization of test execution and results
 */

import blessed from 'blessed';
import contrib from 'blessed-contrib';
import { EventEmitter } from 'events';

export class TestResultsDashboard extends EventEmitter {
  constructor() {
    super();
    this.screen = null;
    this.grid = null;
    this.widgets = {};
    this.testData = {
      overall: { total: 0, passed: 0, failed: 0, running: 0 },
      categories: {},
      recent: [],
      performance: []
    };
  }

  initialize() {
    // Create screen
    this.screen = blessed.screen({
      smartCSR: true,
      title: 'ruv-FANN MCP Test Dashboard'
    });

    // Create grid
    this.grid = new contrib.grid({ rows: 12, cols: 12, screen: this.screen });

    // Create widgets
    this.createWidgets();

    // Handle exit
    this.screen.key(['escape', 'q', 'C-c'], () => {
      this.emit('exit');
      return process.exit(0);
    });

    // Start rendering
    this.screen.render();
  }

  createWidgets() {
    // Title
    this.widgets.title = this.grid.set(0, 0, 1, 12, blessed.box, {
      content: '{center}🚀 ruv-FANN MCP Real-Time Test Dashboard{/center}',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
        bold: true
      }
    });

    // Overall progress gauge
    this.widgets.progressGauge = this.grid.set(1, 0, 2, 4, contrib.gauge, {
      label: 'Overall Progress',
      stroke: 'green',
      fill: 'white',
      percent: 0
    });

    // Accuracy gauge
    this.widgets.accuracyGauge = this.grid.set(1, 4, 2, 4, contrib.gauge, {
      label: 'Current Accuracy',
      stroke: 'blue',
      fill: 'white',
      percent: 0
    });

    // Response time gauge
    this.widgets.responseGauge = this.grid.set(1, 8, 2, 4, contrib.gauge, {
      label: 'Avg Response Time',
      stroke: 'yellow',
      fill: 'white',
      percent: 0
    });

    // Test stats table
    this.widgets.statsTable = this.grid.set(3, 0, 3, 6, contrib.table, {
      keys: true,
      fg: 'white',
      selectedFg: 'white',
      selectedBg: 'blue',
      interactive: false,
      label: 'Test Statistics',
      width: '100%',
      height: '100%',
      border: { type: 'line', fg: 'cyan' },
      columnSpacing: 3,
      columnWidth: [20, 10, 10, 10]
    });

    // Category accuracy bar chart
    this.widgets.categoryChart = this.grid.set(3, 6, 3, 6, contrib.bar, {
      label: 'Accuracy by Category',
      barWidth: 6,
      barSpacing: 2,
      xOffset: 0,
      maxHeight: 100
    });

    // Response time line chart
    this.widgets.perfChart = this.grid.set(6, 0, 3, 12, contrib.line, {
      style: {
        line: 'yellow',
        text: 'green',
        baseline: 'black'
      },
      xLabelPadding: 3,
      xPadding: 5,
      label: 'Response Time Trends (ms)',
      minY: 0,
      maxY: 100
    });

    // Recent tests log
    this.widgets.testLog = this.grid.set(9, 0, 3, 8, contrib.log, {
      fg: 'green',
      selectedFg: 'green',
      label: 'Recent Tests',
      border: { type: 'line', fg: 'cyan' }
    });

    // Warnings/errors log
    this.widgets.errorLog = this.grid.set(9, 8, 3, 4, contrib.log, {
      fg: 'red',
      selectedFg: 'red',
      label: 'Warnings & Errors',
      border: { type: 'line', fg: 'red' }
    });
  }

  updateProgress(completed, total) {
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
    this.widgets.progressGauge.setPercent(percent);
    this.screen.render();
  }

  updateAccuracy(passed, total) {
    const accuracy = total > 0 ? Math.round((passed / total) * 100) : 0;
    this.widgets.accuracyGauge.setPercent(accuracy);
    this.updateStatsTable();
    this.screen.render();
  }

  updateResponseTime(avgTime) {
    // Map to percentage (0-100ms = 0-100%)
    const percent = Math.min(100, Math.round(avgTime));
    this.widgets.responseGauge.setPercent(percent);
    this.widgets.responseGauge.setLabel(`Avg Response: ${avgTime.toFixed(1)}ms`);
    this.screen.render();
  }

  updateStatsTable() {
    const data = [
      ['Metric', 'Count', 'Rate', 'Status'],
      ['Total Tests', String(this.testData.overall.total), '-', '-'],
      ['Passed', String(this.testData.overall.passed), 
       `${this.getPercentage(this.testData.overall.passed, this.testData.overall.total)}%`, '✅'],
      ['Failed', String(this.testData.overall.failed), 
       `${this.getPercentage(this.testData.overall.failed, this.testData.overall.total)}%`, '❌'],
      ['Running', String(this.testData.overall.running), '-', '🔄']
    ];
    
    this.widgets.statsTable.setData({
      headers: data[0],
      data: data.slice(1)
    });
    this.screen.render();
  }

  updateCategoryChart(categories) {
    const data = {};
    const colors = ['green', 'blue', 'cyan', 'magenta', 'yellow'];
    let colorIndex = 0;

    for (const [category, stats] of Object.entries(categories)) {
      const accuracy = stats.total > 0 
        ? Math.round((stats.passed / stats.total) * 100)
        : 0;
      data[category] = {
        percent: accuracy,
        color: colors[colorIndex % colors.length]
      };
      colorIndex++;
    }

    this.widgets.categoryChart.setData(data);
    this.screen.render();
  }

  updatePerformanceChart(dataPoints) {
    // Keep last 50 data points
    const recentPoints = dataPoints.slice(-50);
    
    const x = recentPoints.map((_, i) => String(i));
    const y = recentPoints.map(p => p.responseTime);

    this.widgets.perfChart.setData([{
      title: 'Response Time',
      x: x,
      y: y,
      style: { line: 'yellow' }
    }]);
    this.screen.render();
  }

  logTest(test) {
    const status = test.passed ? '✅' : '❌';
    const message = `${status} ${test.name} (${test.duration}ms)`;
    this.widgets.testLog.log(message);
    
    // Keep recent tests
    this.testData.recent.push(test);
    if (this.testData.recent.length > 100) {
      this.testData.recent.shift();
    }
    
    this.screen.render();
  }

  logError(message) {
    this.widgets.errorLog.log(message);
    this.screen.render();
  }

  handleTestStart(data) {
    this.testData.overall.total = data.totalTests;
    this.testData.overall.running++;
    this.updateStatsTable();
  }

  handleTestComplete(data) {
    const { test, progress } = data;
    
    this.testData.overall.running--;
    if (test.passed) {
      this.testData.overall.passed++;
    } else {
      this.testData.overall.failed++;
    }

    // Update category stats
    const category = test.expected?.failureType || 'success';
    if (!this.testData.categories[category]) {
      this.testData.categories[category] = { total: 0, passed: 0 };
    }
    this.testData.categories[category].total++;
    if (test.passed) {
      this.testData.categories[category].passed++;
    }

    // Update performance data
    this.testData.performance.push({
      timestamp: Date.now(),
      responseTime: test.duration
    });

    // Update displays
    this.updateProgress(
      this.testData.overall.passed + this.testData.overall.failed,
      this.testData.overall.total
    );
    this.updateAccuracy(this.testData.overall.passed, 
      this.testData.overall.passed + this.testData.overall.failed);
    this.updateCategoryChart(this.testData.categories);
    this.updatePerformanceChart(this.testData.performance);
    this.logTest(test);

    // Calculate average response time
    const avgTime = this.testData.performance.reduce((sum, p) => sum + p.responseTime, 0) 
      / this.testData.performance.length;
    this.updateResponseTime(avgTime);
  }

  handleTestError(data) {
    this.testData.overall.running--;
    this.testData.overall.failed++;
    this.logError(`Error: ${data.test.name} - ${data.test.error}`);
    this.updateStatsTable();
  }

  handleComplete(summary) {
    // Display final summary
    const summaryBox = blessed.box({
      parent: this.screen,
      top: 'center',
      left: 'center',
      width: '80%',
      height: '60%',
      content: this.formatSummary(summary),
      tags: true,
      border: {
        type: 'line'
      },
      style: {
        fg: 'white',
        bg: 'black',
        border: {
          fg: '#f0f0f0'
        }
      }
    });

    summaryBox.key(['escape', 'q'], () => {
      summaryBox.destroy();
      this.screen.render();
    });

    this.screen.render();
  }

  formatSummary(summary) {
    return `{center}{bold}Test Execution Complete{/bold}{/center}

Duration: ${summary.duration.toFixed(2)} seconds
Total Tests: ${summary.stats.total}
Passed: ${summary.stats.passed} (${summary.overallAccuracy.toFixed(1)}%)
Failed: ${summary.stats.failed}

{bold}Accuracy by Category:{/bold}
${Object.entries(summary.accuracyByCategory)
  .map(([cat, stats]) => `  ${cat}: ${stats.accuracy.toFixed(1)}%`)
  .join('\n')}

{bold}Performance:{/bold}
  Min: ${summary.performance?.min?.toFixed(0) || 'N/A'}ms
  Mean: ${summary.performance?.mean?.toFixed(0) || 'N/A'}ms
  P95: ${summary.performance?.p95?.toFixed(0) || 'N/A'}ms
  Max: ${summary.performance?.max?.toFixed(0) || 'N/A'}ms

Press ESC or Q to close`;
  }

  getPercentage(value, total) {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }
}

// Run standalone
if (import.meta.url === `file://${process.argv[1]}`) {
  const dashboard = new TestResultsDashboard();
  dashboard.initialize();
  
  // Simulate test data
  setTimeout(() => {
    dashboard.handleTestStart({ totalTests: 50 });
    
    let completed = 0;
    const interval = setInterval(() => {
      completed++;
      
      dashboard.handleTestComplete({
        test: {
          name: `Test ${completed}`,
          passed: Math.random() > 0.25,
          duration: Math.random() * 50 + 5,
          expected: {
            failureType: ['syntax', 'permission', 'cost', 'performance', 'success'][
              Math.floor(Math.random() * 5)
            ]
          }
        },
        progress: (completed / 50) * 100
      });
      
      if (completed >= 50) {
        clearInterval(interval);
        dashboard.handleComplete({
          duration: 45.2,
          stats: { total: 50, passed: 37, failed: 13 },
          overallAccuracy: 74,
          accuracyByCategory: {
            syntax: { accuracy: 92 },
            permission: { accuracy: 87 },
            cost: { accuracy: 73 },
            performance: { accuracy: 68 },
            success: { accuracy: 80 }
          },
          performance: {
            min: 3,
            mean: 12,
            p95: 35,
            max: 48
          }
        });
      }
    }, 500);
  }, 1000);
}

export default TestResultsDashboard;