#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Generate a comprehensive test report from Jest results
 */
class ReportGenerator {
  constructor() {
    this.reportDir = path.join(__dirname, '..', '..', 'test-reports');
    this.resultsDir = path.join(__dirname, '..', '..', 'coverage');
  }

  async generate() {
    console.log('📊 Generating Test Report...\n');

    try {
      // Collect all test results
      const testResults = this.collectTestResults();
      const coverageData = this.collectCoverageData();
      const performanceData = this.collectPerformanceData();
      
      // Calculate metrics
      const metrics = this.calculateMetrics(testResults, coverageData, performanceData);
      
      // Generate report
      const report = {
        generated: new Date().toISOString(),
        summary: this.generateSummary(testResults),
        coverage: this.generateCoverageReport(coverageData),
        performance: this.generatePerformanceReport(performanceData),
        metrics: metrics,
        trends: this.analyzeTrends(),
      };
      
      // Save reports
      this.saveJSON(report);
      this.saveHTML(report);
      this.saveCSV(metrics);
      
      // Print summary
      this.printSummary(report);
      
    } catch (error) {
      console.error('❌ Failed to generate report:', error);
      process.exit(1);
    }
  }

  collectTestResults() {
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

  collectCoverageData() {
    const coverageSummaryPath = path.join(this.resultsDir, 'coverage-summary.json');
    
    if (fs.existsSync(coverageSummaryPath)) {
      return JSON.parse(fs.readFileSync(coverageSummaryPath, 'utf8'));
    }
    
    return null;
  }

  collectPerformanceData() {
    const perfDataPath = path.join(this.reportDir, 'benchmark-report.json');
    
    if (fs.existsSync(perfDataPath)) {
      return JSON.parse(fs.readFileSync(perfDataPath, 'utf8'));
    }
    
    return null;
  }

  calculateMetrics(testResults, coverageData, performanceData) {
    const metrics = {
      tests: {
        total: 0,
        passed: 0,
        failed: 0,
        skipped: 0,
        successRate: 0,
      },
      coverage: {
        lines: 0,
        statements: 0,
        functions: 0,
        branches: 0,
      },
      performance: {
        avgPredictionLatency: 0,
        p95PredictionLatency: 0,
        patternMatchingSpeed: 0,
      },
      quality: {
        score: 0,
        grade: 'F',
      },
    };
    
    // Aggregate test metrics
    testResults.forEach(result => {
      metrics.tests.total += result.numTotalTests || 0;
      metrics.tests.passed += result.numPassedTests || 0;
      metrics.tests.failed += result.numFailedTests || 0;
      metrics.tests.skipped += result.numPendingTests || 0;
    });
    
    metrics.tests.successRate = metrics.tests.total > 0 
      ? metrics.tests.passed / metrics.tests.total 
      : 0;
    
    // Coverage metrics
    if (coverageData && coverageData.total) {
      metrics.coverage.lines = coverageData.total.lines.pct;
      metrics.coverage.statements = coverageData.total.statements.pct;
      metrics.coverage.functions = coverageData.total.functions.pct;
      metrics.coverage.branches = coverageData.total.branches.pct;
    }
    
    // Performance metrics
    if (performanceData && performanceData.summary) {
      metrics.performance = {
        ...performanceData.summary,
      };
    }
    
    // Calculate quality score
    metrics.quality.score = this.calculateQualityScore(metrics);
    metrics.quality.grade = this.getGrade(metrics.quality.score);
    
    return metrics;
  }

  calculateQualityScore(metrics) {
    let score = 0;
    
    // Test success rate (30 points)
    score += metrics.tests.successRate * 30;
    
    // Coverage (40 points)
    const avgCoverage = (
      metrics.coverage.lines +
      metrics.coverage.statements +
      metrics.coverage.functions +
      metrics.coverage.branches
    ) / 4;
    score += (avgCoverage / 100) * 40;
    
    // Performance (30 points)
    if (metrics.performance.avgPredictionLatency) {
      // Lower latency = higher score
      const latencyScore = Math.max(0, 100 - metrics.performance.avgPredictionLatency) / 100;
      score += latencyScore * 30;
    } else {
      score += 15; // Default if no performance data
    }
    
    return Math.round(score);
  }

  getGrade(score) {
    if (score >= 90) return 'A';
    if (score >= 80) return 'B';
    if (score >= 70) return 'C';
    if (score >= 60) return 'D';
    return 'F';
  }

  generateSummary(testResults) {
    const summary = {
      totalSuites: testResults.length,
      totalTests: 0,
      totalPassed: 0,
      totalFailed: 0,
      totalTime: 0,
      suites: [],
    };
    
    testResults.forEach(result => {
      summary.totalTests += result.numTotalTests || 0;
      summary.totalPassed += result.numPassedTests || 0;
      summary.totalFailed += result.numFailedTests || 0;
      summary.totalTime += result.testResults?.[0]?.perfStats?.runtime || 0;
      
      summary.suites.push({
        name: result.suite,
        tests: result.numTotalTests,
        passed: result.numPassedTests,
        failed: result.numFailedTests,
        time: result.testResults?.[0]?.perfStats?.runtime,
      });
    });
    
    return summary;
  }

  generateCoverageReport(coverageData) {
    if (!coverageData) return null;
    
    const report = {
      summary: coverageData.total,
      files: [],
    };
    
    Object.entries(coverageData).forEach(([file, data]) => {
      if (file !== 'total' && typeof data === 'object') {
        report.files.push({
          file: file.replace(process.cwd(), ''),
          lines: data.lines?.pct || 0,
          statements: data.statements?.pct || 0,
          functions: data.functions?.pct || 0,
          branches: data.branches?.pct || 0,
        });
      }
    });
    
    // Sort files by coverage (ascending)
    report.files.sort((a, b) => a.lines - b.lines);
    
    return report;
  }

  generatePerformanceReport(performanceData) {
    if (!performanceData) return null;
    
    return {
      timestamp: performanceData.timestamp,
      environment: performanceData.environment,
      summary: performanceData.summary,
      benchmarks: performanceData.results,
    };
  }

  analyzeTrends() {
    // Load historical data if available
    const historyFile = path.join(this.reportDir, 'test-history.json');
    let history = [];
    
    if (fs.existsSync(historyFile)) {
      history = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    }
    
    // Calculate trends
    const trends = {
      testSuccessRate: this.calculateTrend(history, 'tests.successRate'),
      coverage: this.calculateTrend(history, 'coverage.lines'),
      performance: this.calculateTrend(history, 'performance.avgPredictionLatency'),
    };
    
    return trends;
  }

  calculateTrend(history, path) {
    if (history.length < 2) return { direction: 'stable', change: 0 };
    
    const getValue = (obj, path) => {
      return path.split('.').reduce((acc, part) => acc?.[part], obj);
    };
    
    const recent = getValue(history[history.length - 1], path) || 0;
    const previous = getValue(history[history.length - 2], path) || 0;
    const change = recent - previous;
    
    return {
      direction: change > 0.01 ? 'up' : change < -0.01 ? 'down' : 'stable',
      change: change,
      recent: recent,
      previous: previous,
    };
  }

  saveJSON(report) {
    const filePath = path.join(this.reportDir, 'comprehensive-report.json');
    fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
    console.log(`✓ JSON report saved to: ${filePath}`);
  }

  saveHTML(report) {
    const html = this.generateHTMLReport(report);
    const filePath = path.join(this.reportDir, 'report.html');
    fs.writeFileSync(filePath, html);
    console.log(`✓ HTML report saved to: ${filePath}`);
  }

  saveCSV(metrics) {
    const csv = this.generateCSV(metrics);
    const filePath = path.join(this.reportDir, 'metrics.csv');
    fs.writeFileSync(filePath, csv);
    console.log(`✓ CSV metrics saved to: ${filePath}`);
  }

  generateHTMLReport(report) {
    // Reuse the HTML template from test-harness
    return `
<!DOCTYPE html>
<html>
<head>
  <title>Test Report - ${new Date().toLocaleDateString()}</title>
  <style>
    /* Styles omitted for brevity - same as test-harness */
  </style>
</head>
<body>
  <h1>ruv-FANN MCP Test Report</h1>
  <p>Generated: ${new Date(report.generated).toLocaleString()}</p>
  
  <h2>Quality Score: ${report.metrics.quality.score}/100 (${report.metrics.quality.grade})</h2>
  
  <!-- Rest of HTML content -->
</body>
</html>
    `;
  }

  generateCSV(metrics) {
    const rows = [
      ['Metric', 'Value'],
      ['Total Tests', metrics.tests.total],
      ['Passed Tests', metrics.tests.passed],
      ['Failed Tests', metrics.tests.failed],
      ['Success Rate', (metrics.tests.successRate * 100).toFixed(2) + '%'],
      ['Line Coverage', metrics.coverage.lines + '%'],
      ['Statement Coverage', metrics.coverage.statements + '%'],
      ['Function Coverage', metrics.coverage.functions + '%'],
      ['Branch Coverage', metrics.coverage.branches + '%'],
      ['Avg Prediction Latency', metrics.performance.avgPredictionLatency + 'ms'],
      ['Quality Score', metrics.quality.score],
      ['Quality Grade', metrics.quality.grade],
    ];
    
    return rows.map(row => row.join(',')).join('\n');
  }

  printSummary(report) {
    console.log('\n📈 Test Report Summary');
    console.log('======================\n');
    
    console.log(`Quality Score: ${report.metrics.quality.score}/100 (Grade: ${report.metrics.quality.grade})`);
    console.log(`\nTests: ${report.metrics.tests.passed}/${report.metrics.tests.total} passed (${(report.metrics.tests.successRate * 100).toFixed(1)}%)`);
    console.log(`Coverage: ${report.metrics.coverage.lines.toFixed(1)}% lines`);
    
    if (report.metrics.performance.avgPredictionLatency) {
      console.log(`Performance: ${report.metrics.performance.avgPredictionLatency.toFixed(2)}ms avg latency`);
    }
    
    // Show trends
    if (report.trends) {
      console.log('\nTrends:');
      Object.entries(report.trends).forEach(([metric, trend]) => {
        const arrow = trend.direction === 'up' ? '↑' : trend.direction === 'down' ? '↓' : '→';
        console.log(`  ${metric}: ${arrow} ${trend.direction}`);
      });
    }
    
    console.log('\n✅ Report generation complete!');
  }
}

// Run report generation
const generator = new ReportGenerator();
generator.generate().catch(console.error);