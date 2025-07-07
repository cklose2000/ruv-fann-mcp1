# ruv-FANN MCP Server - Testing Framework

Comprehensive testing framework for verifying AI prediction accuracy, performance, and reliability of the ruv-FANN Enhanced MCP Server.

## Overview

This testing framework provides:
- **Unit Tests**: Component-level testing for predictors, storage, and clients
- **Integration Tests**: End-to-end workflow validation
- **Performance Tests**: Latency, throughput, and scalability benchmarks
- **Accuracy Tests**: AI prediction accuracy measurement
- **Live Monitoring**: Real-time metrics dashboard

## Test Structure

```
tests/
├── unit/                    # Unit tests
│   ├── predictors/         # Predictor tests
│   ├── storage/           # Storage tests
│   └── clients/           # Client tests
├── integration/            # Integration tests
│   ├── accuracy.test.ts   # Prediction accuracy tests
│   └── end-to-end.test.ts # Full workflow tests
├── performance/           # Performance tests
│   ├── benchmark.js      # Standalone benchmark suite
│   └── performance.test.ts # Jest performance tests
├── fixtures/              # Test data and generators
│   ├── test-data-generator.ts
│   └── bigquery-failure-logs.json
├── utils/                 # Test utilities
│   ├── test-helpers.ts   # Helper functions
│   ├── mock-factory.ts   # Mock data generators
│   ├── test-harness.ts   # Automated test runner
│   ├── generate-report.js # Report generator
│   ├── metrics-dashboard.js # Live dashboard
│   └── live-test.js      # Live test runner
└── types/                # Test type definitions
    └── test-types.ts
```

## Running Tests

### Quick Commands

```bash
# Run all tests
npm test

# Run specific test suites
npm run test:unit          # Unit tests only
npm run test:integration   # Integration tests only
npm run test:performance   # Performance tests only
npm run test:accuracy      # Accuracy tests only

# Run with coverage
npm run test:all           # All tests with coverage report

# Watch mode
npm run test:watch         # Run tests on file changes
```

### Advanced Testing

```bash
# Run automated test harness
node tests/utils/test-harness.js

# Run performance benchmark
node tests/performance/benchmark.js

# Generate test report
npm run test:report

# Start metrics dashboard
npm run test:dashboard
```

## Test Scenarios

### 1. BigQuery Failure Patterns
Based on real-world failure logs, we test:
- **Syntax Errors**: Misspelled keywords, invalid column references
- **Permission Errors**: Dataset access denied, missing permissions
- **Resource Limits**: Query timeouts, memory exhaustion
- **Cost Overruns**: Large table scans, cartesian joins

### 2. Authentication Patterns
- Token expiry detection
- Permission changes during operations
- Service account key rotation

### 3. Edge Cases
- Cross-region queries
- Invalid location strings
- Quota exhaustion

## Metrics & KPIs

### Prediction Accuracy Metrics
| Metric | Target | Description |
|--------|--------|-------------|
| Overall Accuracy | ≥ 85% | Correct success/failure predictions |
| Cost Estimation | ±$2.00 | BigQuery cost prediction accuracy |
| False Positive Rate | ≤ 10% | Operations predicted to succeed but failed |
| False Negative Rate | ≤ 15% | Operations predicted to fail but succeeded |

### Performance Metrics
| Metric | Target | Description |
|--------|--------|-------------|
| Prediction Latency | ≤ 100ms | Time to generate prediction |
| Pattern Matching | ≥ 10 patterns/ms | Pattern retrieval speed |
| Concurrent Ops | ≥ 20 | Max parallel predictions |

### Learning Effectiveness
- Pattern recognition improvement over time
- Error pattern detection rate
- Suggestion quality score

## Test Data Generation

### Seed Test Data
```bash
# Generate test patterns
node tests/fixtures/test-data-generator.js seed

# Generate specific scenarios
node tests/fixtures/test-data-generator.js scenario high_failure_rate
node tests/fixtures/test-data-generator.js scenario cost_overruns
node tests/fixtures/test-data-generator.js scenario auth_failures
node tests/fixtures/test-data-generator.js scenario performance_degradation

# View test data statistics
node tests/fixtures/test-data-generator.js stats
```

### Test Patterns
The framework includes:
- 100+ known good BigQuery operations
- 100+ known failure patterns with error types
- 50+ edge case scenarios
- 25+ performance test queries

## Live Monitoring

### Metrics Dashboard
Start the real-time metrics dashboard:
```bash
npm run test:dashboard
# Opens at http://localhost:3456
```

Features:
- Live prediction metrics
- Success rate tracking
- Latency monitoring
- System resource usage
- Recent test results

### Dashboard Metrics
- **Total Predictions**: Running count of all predictions
- **Success Rate**: Percentage of correct predictions
- **Avg Latency**: Average prediction time
- **Memory Usage**: Current heap usage

## Test Reports

### Automated Reports
After running tests, generate comprehensive reports:
```bash
npm run test:report
```

Outputs:
- `test-reports/comprehensive-report.json`: Full JSON report
- `test-reports/report.html`: HTML dashboard
- `test-reports/metrics.csv`: CSV metrics export
- `test-reports/test-summary.md`: Markdown summary

### Report Contents
- Test suite results
- Code coverage metrics
- Performance benchmarks
- Accuracy measurements
- Trend analysis
- Recommendations

## Continuous Testing

### CI/CD Integration
```yaml
# Example GitHub Actions workflow
- name: Run Tests
  run: |
    npm run test:all
    npm run test:report
    
- name: Upload Coverage
  uses: codecov/codecov-action@v3
  with:
    directory: ./test-reports/coverage
```

### Success Criteria

#### Phase 1 (Initial)
- 70% prediction accuracy
- 80% cost estimation accuracy (±20%)
- <100ms prediction latency

#### Phase 2 (Learned)
- 85% prediction accuracy
- 90% cost estimation accuracy (±10%)
- <50ms prediction latency

#### Phase 3 (Optimized)
- 95% prediction accuracy
- 95% cost estimation accuracy (±5%)
- <25ms prediction latency

## Writing New Tests

### Unit Test Example
```typescript
describe('GCPPredictor', () => {
  it('should predict syntax errors', async () => {
    const prediction = await predictor.predictGCPOperation(
      'bq-query',
      { query: 'SELECT * FROM table WHRE id = 1' },
      {}
    );
    
    expect(prediction.successProbability).toBeLessThan(0.5);
    expect(prediction.warnings).toContainEqual(
      expect.objectContaining({ type: 'syntax' })
    );
  });
});
```

### Integration Test Example
```typescript
it('should improve accuracy with learning', async () => {
  // Record failures
  for (let i = 0; i < 20; i++) {
    await patternStorage.recordCommandPattern({
      tool: 'bq-query',
      params: JSON.stringify({ query: 'problematic query' }),
      outcome: 'failure',
      error: 'Timeout',
    });
  }
  
  // Test improved prediction
  const prediction = await predictor.predictGCPOperation(
    'bq-query',
    { query: 'problematic query' },
    {}
  );
  
  expect(prediction.successProbability).toBeLessThan(0.3);
});
```

## Troubleshooting

### Common Issues

1. **Test Timeouts**
   - Increase timeout: `--testTimeout=30000`
   - Check backend service connectivity

2. **Database Locks**
   - Clean test databases: `rm tests/fixtures/*.db`
   - Use in-memory databases for speed

3. **Flaky Tests**
   - Check for timing dependencies
   - Use `waitFor` helper for async operations

### Debug Mode
```bash
# Run tests with verbose logging
LOG_LEVEL=debug npm test

# Run single test file
npm test -- tests/unit/predictors/gcp-predictor.test.ts
```

## Contributing

When adding new tests:
1. Follow existing patterns and conventions
2. Include both positive and negative test cases
3. Add performance benchmarks for new features
4. Update test data generators as needed
5. Document new test scenarios

## License

[Same as parent project]