# Property-Based Testing

Property-based testing helps find edge cases by testing invariants that should always hold true, regardless of input data. This complements our example-based tests by exploring the input space more thoroughly.

## Why Property-Based Testing?

1. **Finds Edge Cases**: Automatically generates hundreds of test cases including edge cases humans might miss
2. **Tests Invariants**: Verifies properties that should always be true
3. **Reduces Test Bias**: Tests with randomly generated data rather than cherry-picked examples
4. **Better Coverage**: Explores input space more thoroughly than example-based tests
5. **Regression Prevention**: Failed cases are saved and re-tested in future runs

## Library: fast-check

We use [fast-check](https://github.com/dubzzz/fast-check) for property-based testing:

```bash
npm install -D fast-check
```

## Writing Property Tests

### Basic Structure

```typescript
import fc from 'fast-check';

describe('Property Tests', () => {
  it('should maintain invariant X', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generators for input data
        fc.string(),
        fc.integer({ min: 0, max: 100 }),
        
        // Property function
        async (str, num) => {
          const result = await functionUnderTest(str, num);
          
          // Assert properties that should always hold
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(100);
        }
      )
    );
  });
});
```

## Properties We Test

### 1. Pattern Storage Properties

```typescript
// Patterns should always be returned in reverse chronological order
// Concurrent storage should never lose patterns
// Success rate calculations should be mathematically correct
```

### 2. Prediction Properties

```typescript
// Success probability must be in [0, 1]
// Confidence must be in [0, 1]
// No NaN or undefined values in responses
// Warnings should correlate with low success probability
```

### 3. Cost Estimation Properties

```typescript
// Costs should never be negative
// Only billable operations should have costs
// Complex queries should have higher cost estimates
```

### 4. Authentication Properties

```typescript
// Failure rate should increase with token age
// Token age thresholds should be monotonic
```

## Common Generators

### Built-in Generators

```typescript
fc.string()                    // Any string
fc.integer({ min: 0, max: 100 }) // Bounded integer
fc.float({ min: 0, max: 1 })    // Bounded float
fc.boolean()                    // true/false
fc.constantFrom('a', 'b', 'c')  // Pick from values
fc.array(fc.string())           // Array of strings
fc.record({ ... })              // Object with properties
fc.oneof(gen1, gen2)           // One of multiple generators
fc.option(gen)                  // Generator or undefined
```

### Custom Generators

```typescript
// Generate valid SQL queries
const validQuery = fc.oneof(
  fc.constant('SELECT 1'),
  fc.tuple(
    fc.constantFrom('SELECT', 'INSERT', 'UPDATE'),
    fc.string()
  ).map(([action, table]) => `${action} FROM ${table}`)
);

// Generate realistic contexts
const gcpContext = fc.record({
  timestamp: fc.integer({ min: Date.now() - 3600000, max: Date.now() }),
  authTokenAge: fc.option(fc.integer({ min: 0, max: 120 })),
  region: fc.constantFrom('us', 'eu', 'asia'),
});
```

## Properties to Test

### Good Properties

1. **Invariants**: Things that must always be true
   ```typescript
   // Output is always within valid range
   expect(result).toBeWithinRange(0, 100);
   ```

2. **Relationships**: How outputs relate to inputs
   ```typescript
   // More data → higher confidence
   expect(moreData.confidence).toBeGreaterThan(lessData.confidence);
   ```

3. **Idempotence**: Multiple applications don't change result
   ```typescript
   const once = await normalize(data);
   const twice = await normalize(once);
   expect(twice).toEqual(once);
   ```

4. **Symmetry**: Inverse operations cancel out
   ```typescript
   const encoded = encode(data);
   const decoded = decode(encoded);
   expect(decoded).toEqual(data);
   ```

### Poor Properties

1. **Testing Implementation Details**
   ```typescript
   // Bad: Tests how, not what
   expect(internalCache.size).toBe(5);
   ```

2. **Overly Specific Properties**
   ```typescript
   // Bad: Too specific to be useful
   expect(result).toBe(input * 2.7183);
   ```

## Integration with Existing Tests

Property tests complement but don't replace example-based tests:

```typescript
describe('Pattern Matching', () => {
  // Example-based test for specific case
  it('should handle known query pattern', () => {
    const result = match('SELECT * FROM users WHERE id = 1');
    expect(result.type).toBe('SELECT');
  });
  
  // Property test for general behavior
  it('should extract query type for any valid query', () => {
    fc.assert(
      fc.property(
        validQueryGenerator(),
        (query) => {
          const result = match(query);
          expect(['SELECT', 'INSERT', 'UPDATE', 'DELETE'])
            .toContain(result.type);
        }
      )
    );
  });
});
```

## Debugging Failed Properties

When a property test fails, fast-check provides:

1. **Failing Input**: The exact input that caused failure
2. **Seed**: Reproducible test seed
3. **Shrunk Input**: Minimal failing case

```typescript
// Re-run with specific seed to debug
fc.assert(
  fc.property(...),
  { seed: 1234, path: "2:1:0" }
);
```

## Performance Considerations

1. **Limit Runs**: Default is 100, adjust as needed
   ```typescript
   fc.assert(fc.property(...), { numRuns: 500 });
   ```

2. **Timeout Long Operations**
   ```typescript
   it('should complete quickly', async () => {
     await fc.assert(
       fc.asyncProperty(...),
       { timeout: 1000 } // 1 second timeout
     );
   });
   ```

3. **Skip Slow Generators**
   ```typescript
   const fastString = fc.string({ maxLength: 100 });
   // Instead of unbounded fc.string()
   ```

## Best Practices

1. **Start Simple**: Begin with obvious properties
2. **Think in Invariants**: What must always be true?
3. **Use Shrinking**: Let fast-check find minimal cases
4. **Save Regressions**: Add failed cases as example tests
5. **Combine Approaches**: Use with example and integration tests

## Example: Complete Property Test

```typescript
describe('Cost Prediction Properties', () => {
  it('should never predict negative costs regardless of input', async () => {
    await fc.assert(
      fc.asyncProperty(
        // Generate various patterns including edge cases
        fc.array(
          fc.record({
            queryType: fc.constantFrom('SELECT', 'INSERT', 'UPDATE'),
            tableSize: fc.float({ min: 0, max: 1000 }),
            cost: fc.float({ min: -10, max: 100 }), // Include negative
          }),
          { minLength: 1, maxLength: 50 }
        ),
        
        async (patterns) => {
          // Store patterns (even with invalid data)
          for (const pattern of patterns) {
            await storage.recordQueryPattern(pattern);
          }
          
          // Test prediction
          const prediction = await storage.predictQueryCost('SELECT', 10);
          
          // Property: Cost should never be negative
          expect(prediction.avgCost).toBeGreaterThanOrEqual(0);
          
          // Property: Confidence should be valid
          expect(prediction.confidence).toBeWithinRange(0, 1);
        }
      ),
      { numRuns: 200 } // Run 200 times with different inputs
    );
  });
});
```

## Summary

Property-based testing helps us:
- Find edge cases automatically
- Test invariants that should always hold
- Gain confidence in our implementation
- Reduce bias in test cases

Combined with our philosophy of using real components over mocks, property tests help ensure our system behaves correctly across the entire input space, not just for hand-picked examples.