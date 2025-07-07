# MCP Agent Test Scenarios

## Test Objectives
1. Validate MCP tool functionality with real Claude agent interactions
2. Measure actual prediction accuracy and response times
3. Test error handling and edge cases
4. Verify business value claims

## Scenario Categories

### 1. Syntax Error Detection Tests
```sql
-- Test 1.1: Missing FROM clause
SELECT customer_id, order_total WHERE created_date > "2024-01-01"

-- Test 1.2: Unbalanced parentheses
SELECT customer_id, SUM(CASE WHEN status = 'complete' THEN total END FROM orders

-- Test 1.3: Invalid column names
SELECT custmer_id, ordr_total FROM orders LIMIT 10

-- Test 1.4: Missing commas
SELECT customer_id customer_name order_total FROM orders

-- Test 1.5: Wrong date format
SELECT * FROM orders WHERE date > "01-15-2024"
```

### 2. Permission Error Tests
```sql
-- Test 2.1: Restricted dataset
SELECT * FROM finance.salary_data

-- Test 2.2: Cross-project access
SELECT * FROM other-project.analytics.users

-- Test 2.3: Sensitive PII data
SELECT ssn, credit_card FROM customers.sensitive_data

-- Test 2.4: Wrong service account
SELECT * FROM production.restricted_logs

-- Test 2.5: Dataset typo (looks like permission)
SELECT * FROM anlytics.orders
```

### 3. Cost Prevention Tests
```sql
-- Test 3.1: Full table scan on large table
SELECT * FROM production.billion_row_events

-- Test 3.2: Cartesian join
SELECT * FROM orders o, customers c, products p

-- Test 3.3: No LIMIT on exploration
SELECT * FROM analytics.user_events

-- Test 3.4: Cross-region query
SELECT * FROM `us-east1.sales.orders` UNION ALL SELECT * FROM `eu-west1.sales.orders`

-- Test 3.5: Expensive aggregation
SELECT customer_id, COUNT(*) FROM trillion_row_table GROUP BY customer_id
```

### 4. Performance Optimization Tests
```sql
-- Test 4.1: Wildcard with specific columns needed
SELECT * FROM orders WHERE customer_id = 12345

-- Test 4.2: Missing partition filter
SELECT * FROM events WHERE user_id = 'abc123'

-- Test 4.3: Inefficient JOIN
SELECT * FROM large_table_a JOIN large_table_b ON a.id = b.id

-- Test 4.4: Suboptimal WHERE clause
SELECT * FROM orders WHERE DATE(created_at) = '2024-01-01'

-- Test 4.5: Missing indexes consideration
SELECT * FROM products WHERE LOWER(name) LIKE '%widget%'
```

### 5. Success Cases (Should Pass)
```sql
-- Test 5.1: Well-formed query with LIMIT
SELECT customer_id, order_total FROM orders WHERE created_date > '2024-01-01' LIMIT 1000

-- Test 5.2: Efficient aggregation
SELECT DATE(created_at) as order_date, COUNT(*) as order_count 
FROM orders 
WHERE created_at >= '2024-01-01'
GROUP BY DATE(created_at)
LIMIT 100

-- Test 5.3: Proper JOIN with filters
SELECT o.order_id, c.customer_name 
FROM orders o
JOIN customers c ON o.customer_id = c.id
WHERE o.status = 'completed'
LIMIT 500

-- Test 5.4: Partitioned query
SELECT * FROM events 
WHERE DATE(_PARTITIONTIME) = '2024-01-20'
AND user_id = 'user123'

-- Test 5.5: Cost-effective exploration
SELECT * FROM EXTERNAL_QUERY(
  'us-east1',
  'SELECT TOP 10 * FROM dataset.table'
)
```

## Expected Agent Actions

For each test scenario, the agent should:

1. **Call MCP Tool**: Use `gcp-sql` or `bq-query` with the test query
2. **Receive Prediction**: Get AI analysis with warnings/suggestions
3. **Make Decision**: Based on prediction, decide to proceed or modify
4. **Record Results**: Log prediction accuracy and timing
5. **Calculate Metrics**: Track success rate, false positives, timing

## Performance Metrics to Collect

- **Response Time**: MCP tool response latency
- **Prediction Accuracy**: Did prediction match actual outcome?
- **Warning Quality**: Were warnings helpful and accurate?
- **Suggestion Usefulness**: Did suggestions improve the query?
- **False Positive Rate**: Warnings on valid queries
- **False Negative Rate**: Missed actual problems

## Test Execution Plan

```python
test_results = {
    "syntax_errors": {"total": 5, "caught": 0, "accuracy": 0},
    "permission_errors": {"total": 5, "caught": 0, "accuracy": 0},
    "cost_prevention": {"total": 5, "caught": 0, "accuracy": 0},
    "performance": {"total": 5, "caught": 0, "accuracy": 0},
    "success_cases": {"total": 5, "false_positives": 0, "accuracy": 0},
    "timing": {"min": 999, "max": 0, "avg": 0, "total": 0}
}
```

## Expected Outcomes

Based on our neural network training:
- Syntax errors: 100% detection rate
- Permission errors: 100% detection rate  
- Cost prevention: 66%+ detection rate
- Performance issues: 50%+ detection rate
- False positive rate: <25%
- Average response time: <5ms

## Agent Success Criteria

The agent test is successful if:
1. Overall accuracy ≥ 70%
2. Response time < 10ms average
3. Syntax/permission detection = 100%
4. Cost prevention ≥ 60%
5. False positive rate < 30%