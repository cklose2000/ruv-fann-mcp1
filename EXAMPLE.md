# ruv-FANN MCP Example: Learning from BigQuery Failures

## Scenario

Claude Code is helping a user analyze data in BigQuery. The user keeps making queries that fail due to various issues.

## Initial Attempts

### Attempt 1: Full Table Scan
```
User: "Query the user_events table to find all mobile users"

Claude Code attempts:
bq query --use_legacy_sql=false "SELECT * FROM analytics.user_events WHERE platform = 'mobile'"

Result: FAILURE - "Query exceeded resource limits"
Duration: 30 seconds timeout
```

**MCP Learning**: Pattern stored - full table scan on large table fails

### Attempt 2: Missing Dataset
```
User: "Now query the sessions table"

Claude Code attempts:
bq query --use_legacy_sql=false "SELECT * FROM sessions WHERE duration > 60"

Result: FAILURE - "Not found: Dataset analytics"
Duration: 500ms
```

**MCP Learning**: Pattern stored - unqualified table names fail

## With MCP Predictions

### Attempt 3: Similar Query with Predictions
```
User: "Query the page_views table for desktop users"

MCP Intercepts: bq query "SELECT * FROM analytics.page_views WHERE platform = 'desktop'"

MCP Prediction:
{
  "successProbability": 0.15,
  "confidence": 0.92,
  "warnings": [{
    "level": "high",
    "message": "Query will likely exceed resource limits based on 2 similar failures",
    "suggestion": {
      "tool": "bq query",
      "params": {
        "query": "SELECT * FROM analytics.page_views WHERE platform = 'desktop' LIMIT 1000"
      },
      "rationale": "Add LIMIT to prevent resource exhaustion"
    }
  }],
  "predictedDuration": 30000,
  "explanation": "Based on 2 similar patterns with SELECT * on analytics tables"
}

Claude Code responds:
"This query might exceed resource limits. Let me add a LIMIT clause first to test:"

Executes modified query:
bq query --use_legacy_sql=false "SELECT * FROM analytics.page_views WHERE platform = 'desktop' LIMIT 1000"

Result: SUCCESS
Duration: 850ms
```

## Learning Evolution

### After 10 Similar Queries

MCP has learned:
1. **Table Size Patterns**:
   - `analytics.user_events`: ~50TB
   - `analytics.page_views`: ~30TB  
   - `analytics.sessions`: ~10TB

2. **Failure Patterns**:
   - `SELECT *` on tables >1TB → 95% failure rate
   - Unqualified table names → 100% failure rate
   - Queries without partition filter → 78% failure rate

3. **Success Patterns**:
   - Adding LIMIT 1000 → 89% success rate
   - Using partition filters → 94% success rate
   - Qualifying table names → 100% success rate

### Attempt 20: Intelligent Suggestions
```
User: "Analyze all user events from last month"

Claude Code plans:
bq query "SELECT * FROM user_events WHERE date >= '2024-11-01'"

MCP Prediction:
{
  "successProbability": 0.08,
  "confidence": 0.96,
  "warnings": [
    {
      "level": "high",
      "message": "Multiple issues detected",
      "suggestion": {
        "tool": "bq query",
        "params": {
          "query": "SELECT event_type, COUNT(*) as count FROM analytics.user_events WHERE date >= '2024-11-01' AND date < '2024-12-01' GROUP BY event_type",
          "use_legacy_sql": false,
          "max_bytes_billed": 1099511627776
        },
        "rationale": "Use aggregation instead of SELECT *, add dataset qualifier, use date partitioning, set billing limit"
      }
    }
  ],
  "alternativeSuggestions": [
    {
      "description": "Preview data first",
      "tool": "bq head",
      "params": { "table": "analytics.user_events", "max_rows": 100 }
    },
    {
      "description": "Check table size",
      "tool": "bq show",
      "params": { "table": "analytics.user_events" }
    }
  ]
}

Claude Code responds:
"Based on past experiences with this table, a full scan would likely fail. Let me:
1. First check the table size
2. Use an aggregated query with proper partitioning
3. Set a billing limit for safety"

Executes:
1. bq show analytics.user_events  # SUCCESS - 52TB table
2. Modified aggregation query      # SUCCESS - 2.3 seconds
```

## Pattern Recognition Examples

### Git Operations
```
Pattern: git push without pull after 2+ hours
Success Rate: 35%
Suggestion: Run 'git pull --rebase' first

Pattern: git commit without staged changes  
Success Rate: 0%
Suggestion: Run 'git add' first or use 'git commit -a'
```

### GCP Authentication
```
Pattern: gcloud commands after 2 hours idle
Success Rate: 20%  
Suggestion: Run 'gcloud auth application-default login'

Pattern: Cross-project queries without project set
Success Rate: 15%
Suggestion: Set project with 'gcloud config set project PROJECT_ID'
```

## Benefits Demonstrated

1. **Fewer Failures**: 70% reduction in repeated errors
2. **Faster Resolution**: Immediate suggestions vs trial-and-error
3. **Cost Savings**: Prevented expensive BigQuery scans
4. **Learning Transfer**: Patterns from one table apply to others
5. **Contextual Intelligence**: Time-based patterns (auth expiry)

## How It Works

1. **Interception**: MCP catches tool request before execution
2. **Analysis**: 4 ephemeral agents analyze in parallel (<50ms)
3. **Prediction**: Neural network synthesizes predictions
4. **Suggestion**: Provides alternatives with success probabilities
5. **Learning**: Outcomes feed back into pattern database

The system gets smarter with every command, building a memory of what works and what doesn't in specific contexts.