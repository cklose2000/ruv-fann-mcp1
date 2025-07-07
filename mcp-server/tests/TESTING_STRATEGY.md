# ruv-FANN MCP Server Testing Strategy

## Philosophy: Real Components Over Mocks

This document outlines our testing philosophy and explains why we prioritize real components over mocks to avoid "test hallucinations" - tests that pass against mocks but fail in production.

## Core Principles

### 1. **Avoid Mock-Induced Hallucinations**
Mocking can lead to tests that provide false confidence. A test passing against a mock doesn't guarantee the real implementation works. We've seen too many cases where:
- Mocked APIs don't match real API behavior
- Mock return values don't reflect actual data structures
- Timing and async behavior differs between mocks and reality
- Error conditions are oversimplified in mocks

### 2. **Test Pyramid with Real Components**

```
         ╱─────────────╲
        ╱  E2E Tests   ╲    ← Real services, real databases
       ╱───────────────╲
      ╱ Integration    ╲   ← Real databases, service contracts
     ╱─────────────────╲
    ╱   Unit Tests     ╲  ← Real SQLite, minimal mocking
   ╱───────────────────╲
```

### 3. **When We Do Mock, We Mock Correctly**
When mocking is unavoidable:
- Mock at the boundary (external services only)
- Use contract tests to verify mock accuracy
- Keep mocks as simple as possible
- Document why mocking was necessary

## Current Testing Approach

### Unit Tests
- **Storage Layer**: Uses real SQLite databases, not mocks
- **Pattern Analysis**: Tests against real data structures
- **Skipped Tests**: We explicitly skip tests that would require unreliable ESM mocks rather than create fragile test suites

Example of our approach:
```typescript
// BAD: Mocking database
const mockDb = { query: jest.fn().mockResolvedValue([]) };

// GOOD: Using real database
const storage = new GCPPatternStorage('./test.db');
```

### Integration Tests
- Require actual backend services to be running
- Fail fast if services aren't available
- Test real HTTP connections and responses
- No mocked network calls

### Performance Tests
- Measure actual database operations
- Use real data volumes
- No simulated timing or fake metrics

## Test Data vs Mocks

Our `MockFactory` is actually a **test data generator**, not a mock object factory:

```typescript
// This creates real data for testing
MockFactory.createCommandPattern({
  tool: 'bq-query',
  outcome: 'success'
});

// NOT this anti-pattern
const mockService = {
  predict: jest.fn().mockResolvedValue({ success: true })
};
```

## When Mocking Is Acceptable

1. **External APIs** that would incur costs or have rate limits
2. **Time-dependent code** where we need deterministic behavior
3. **Error conditions** that are hard to reproduce (but use sparingly)
4. **Third-party services** we can't control

Even then, we:
- Keep mocks minimal
- Use contract tests to verify mock accuracy
- Document the mock's limitations

## Testing Challenges We Accept

### 1. **Slower Test Execution**
Real databases and services are slower than mocks. We accept this trade-off for reliability.

### 2. **Complex Test Setup**
Setting up real databases and services is more complex. We use:
- Docker containers for services
- Automated database seeding
- Clear setup/teardown procedures

### 3. **Flaky Integration Tests**
Real network calls can be flaky. We:
- Implement proper retries
- Use circuit breakers
- Accept that some flakiness reflects production reality

## Future Improvements

### 1. **Vitest for Better ESM Support**
Enable currently skipped unit tests by migrating to Vitest, which has native ESM support.

### 2. **Contract Testing**
Implement contract tests between services to ensure APIs match expectations.

### 3. **Test Containers**
Use testcontainers to spin up real service instances for integration tests.

### 4. **Property-Based Testing**
For pattern matching logic, use property-based testing to find edge cases.

## Example: Why We Skip Some Tests

```typescript
// From gcp-predictor.test.ts
describe.skip('GCPPredictor', () => {  
  // Skip for now due to ESM mocking complexity
```

We'd rather skip a test than create an unreliable mock. This honesty helps us:
- Know which areas lack coverage
- Avoid false confidence
- Focus on improving our testing tools

## Conclusion

Our testing philosophy prioritizes **correctness over coverage**. We'd rather have 70% coverage with reliable tests than 100% coverage with mocked hallucinations. Every test should increase confidence that our code works in production, not just in the test environment.

Remember: **A failing test against real components is more valuable than a passing test against mocks.**