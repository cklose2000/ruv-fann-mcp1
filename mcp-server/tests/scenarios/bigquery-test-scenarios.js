/**
 * BigQuery Test Scenarios for ruv-FANN MCP
 * 
 * Comprehensive test cases covering all failure types and success patterns
 * to validate the 73.3% prediction accuracy claim.
 */

export const TEST_SCENARIOS = {
  syntaxErrors: [
    {
      id: 'syntax_missing_from',
      name: 'Missing FROM clause',
      query: 'SELECT customer_id, order_total WHERE created_date > "2024-01-01"',
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 5,
      businessImpact: 'Developer forgets FROM clause, gets cryptic error',
      expectedError: 'Syntax error: Expected keyword FROM'
    },
    {
      id: 'syntax_unbalanced_parens',
      name: 'Unbalanced parentheses',
      query: `SELECT customer_id, 
              SUM(CASE WHEN status = 'complete' THEN amount ELSE 0 END as revenue
              FROM orders WHERE date > "2024-01-01" GROUP BY customer_id`,
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 10,
      businessImpact: 'Missing closing parenthesis in complex query'
    },
    {
      id: 'syntax_invalid_columns',
      name: 'Invalid column references',
      query: 'SELECT cusomer_id, ordr_total FROM orders LIMIT 10',
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 8,
      businessImpact: 'Typos in column names'
    },
    {
      id: 'syntax_missing_comma',
      name: 'Missing comma in SELECT',
      query: `SELECT 
              customer_id
              customer_name
              order_total
              FROM orders`,
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 7,
      businessImpact: 'Forgot comma between columns'
    },
    {
      id: 'syntax_invalid_date',
      name: 'Invalid date format',
      query: 'SELECT * FROM orders WHERE date > "01-15-2024"',
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 6,
      businessImpact: 'US date format instead of ISO'
    },
    {
      id: 'syntax_missing_quotes',
      name: 'Missing quotes around string',
      query: 'SELECT * FROM orders WHERE status = complete',
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 5,
      businessImpact: 'String literal without quotes'
    },
    {
      id: 'syntax_wrong_quotes',
      name: 'Wrong quotes for identifiers',
      query: "SELECT * FROM 'project.dataset.table'",
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 6,
      businessImpact: 'Using quotes instead of backticks'
    },
    {
      id: 'syntax_null_comparison',
      name: 'Wrong NULL comparison',
      query: 'SELECT * FROM users WHERE last_login = NULL',
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 7,
      businessImpact: 'Should use IS NULL'
    },
    {
      id: 'syntax_invalid_join',
      name: 'Invalid JOIN syntax',
      query: 'SELECT * FROM orders JOIN customers',
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 8,
      businessImpact: 'Missing ON clause in JOIN'
    },
    {
      id: 'syntax_duplicate_alias',
      name: 'Duplicate column alias',
      query: 'SELECT id AS user_id, name AS user_id FROM users',
      expectedOutcome: 'failure',
      expectedFailureType: 'syntax',
      timeWasted: 6,
      businessImpact: 'Same alias used twice'
    }
  ],

  permissionErrors: [
    {
      id: 'perm_wrong_project',
      name: 'Wrong project context',
      query: 'SELECT * FROM staging-project.analytics.users LIMIT 10',
      params: { projectId: 'production-project' },
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 20,
      businessImpact: 'Querying staging from production'
    },
    {
      id: 'perm_restricted_dataset',
      name: 'Restricted dataset access',
      query: 'SELECT * FROM finance.salary_data',
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 30,
      businessImpact: 'No IAM role for HR data'
    },
    {
      id: 'perm_cross_region',
      name: 'Cross-region dataset',
      query: 'SELECT * FROM `us-east1.sales.orders` UNION ALL SELECT * FROM `eu-west1.sales.orders`',
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 25,
      businessImpact: 'Cross-region permissions missing'
    },
    {
      id: 'perm_service_account',
      name: 'Wrong service account',
      query: 'SELECT * FROM analytics.sensitive_user_data',
      context: { serviceAccount: 'dev-sa@project.iam' },
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 15,
      businessImpact: 'Dev SA for production data'
    },
    {
      id: 'perm_dataset_typo',
      name: 'Dataset typo looks like permission',
      query: 'SELECT * FROM anlytics.orders',
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 20,
      businessImpact: 'Misspelled dataset returns permission denied'
    },
    {
      id: 'perm_pii_access',
      name: 'Unauthorized PII access',
      query: 'SELECT ssn, credit_card FROM customers.personal_info',
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 25,
      businessImpact: 'GDPR/CCPA violation risk'
    },
    {
      id: 'perm_external_dataset',
      name: 'External dataset access',
      query: 'SELECT * FROM external-project.public.data',
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 20,
      businessImpact: 'No access to external project'
    },
    {
      id: 'perm_billing_export',
      name: 'Billing export access',
      query: 'SELECT * FROM billing.gcp_billing_export',
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 15,
      businessImpact: 'Restricted billing data'
    },
    {
      id: 'perm_audit_logs',
      name: 'Audit log access',
      query: 'SELECT * FROM logs.cloudaudit_googleapis_com_data_access',
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 20,
      businessImpact: 'Audit logs require special permissions'
    },
    {
      id: 'perm_temp_table',
      name: 'Temp table creation denied',
      query: 'CREATE TEMP TABLE temp_analysis AS SELECT * FROM production.users',
      expectedOutcome: 'failure',
      expectedFailureType: 'permission',
      timeWasted: 15,
      businessImpact: 'No CREATE permission in dataset'
    }
  ],

  costOverruns: [
    {
      id: 'cost_full_scan',
      name: 'Full table scan without LIMIT',
      query: 'SELECT * FROM production.events',
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 500,
      timeWasted: 10,
      businessImpact: 'Scanning 10TB table'
    },
    {
      id: 'cost_cartesian_join',
      name: 'Cartesian join',
      query: 'SELECT * FROM orders o, customers c, products p WHERE o.customer_id = c.id',
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 150,
      timeWasted: 8,
      businessImpact: 'Accidental cartesian product'
    },
    {
      id: 'cost_wildcard_tables',
      name: 'Wildcard table scan',
      query: 'SELECT * FROM `project.dataset.events_*`',
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 300,
      timeWasted: 12,
      businessImpact: 'Scanning all sharded tables'
    },
    {
      id: 'cost_no_partition_filter',
      name: 'Missing partition filter',
      query: 'SELECT * FROM events WHERE user_id = 12345',
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 200,
      timeWasted: 10,
      businessImpact: 'Scanning all partitions'
    },
    {
      id: 'cost_select_star_join',
      name: 'SELECT * with multiple JOINs',
      query: `SELECT * FROM orders o 
              JOIN customers c ON o.customer_id = c.id
              JOIN products p ON o.product_id = p.id
              JOIN categories cat ON p.category_id = cat.id`,
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 250,
      timeWasted: 15,
      businessImpact: 'Returning all columns from 4 tables'
    },
    {
      id: 'cost_distinct_large',
      name: 'DISTINCT on large dataset',
      query: 'SELECT DISTINCT user_id FROM events',
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 100,
      timeWasted: 8,
      businessImpact: 'Expensive deduplication'
    },
    {
      id: 'cost_order_by_no_limit',
      name: 'ORDER BY without LIMIT',
      query: 'SELECT * FROM transactions ORDER BY amount DESC',
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 150,
      timeWasted: 10,
      businessImpact: 'Sorting entire table'
    },
    {
      id: 'cost_regex_extract',
      name: 'Complex REGEX on large table',
      query: "SELECT REGEXP_EXTRACT(content, r'[a-z0-9._%+-]+@[a-z0-9.-]+\\.[a-z]{2,}') FROM documents",
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 200,
      timeWasted: 12,
      businessImpact: 'CPU-intensive regex on all rows'
    },
    {
      id: 'cost_cross_join',
      name: 'Explicit CROSS JOIN',
      query: 'SELECT * FROM users CROSS JOIN products',
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 300,
      timeWasted: 15,
      businessImpact: 'Intentional cartesian product'
    },
    {
      id: 'cost_subquery_inefficient',
      name: 'Inefficient correlated subquery',
      query: `SELECT *, (SELECT COUNT(*) FROM orders WHERE customer_id = c.id) as order_count
              FROM customers c`,
      expectedOutcome: 'failure',
      expectedFailureType: 'cost',
      expectedCost: 180,
      timeWasted: 12,
      businessImpact: 'N+1 query pattern'
    }
  ],

  performanceIssues: [
    {
      id: 'perf_cross_region',
      name: 'Cross-region query',
      query: 'SELECT * FROM `us-central1.sales.orders` JOIN `eu-west1.inventory.products` USING(product_id)',
      expectedOutcome: 'failure',
      expectedFailureType: 'performance',
      expectedDuration: 30000,
      timeWasted: 25,
      businessImpact: 'Data transfer across regions'
    },
    {
      id: 'perf_no_cluster',
      name: 'Query without clustering benefit',
      query: 'SELECT * FROM clustered_table WHERE non_clustered_column = "value"',
      expectedOutcome: 'failure',
      expectedFailureType: 'performance',
      expectedDuration: 20000,
      timeWasted: 15,
      businessImpact: 'Not using clustered columns'
    },
    {
      id: 'perf_complex_cte',
      name: 'Overly complex CTEs',
      query: `WITH cte1 AS (SELECT * FROM table1),
              cte2 AS (SELECT * FROM cte1 JOIN table2),
              cte3 AS (SELECT * FROM cte2 JOIN table3),
              cte4 AS (SELECT * FROM cte3 JOIN table4)
              SELECT * FROM cte4`,
      expectedOutcome: 'failure',
      expectedFailureType: 'performance',
      expectedDuration: 25000,
      timeWasted: 20,
      businessImpact: 'Too many CTE layers'
    },
    {
      id: 'perf_string_functions',
      name: 'Heavy string manipulation',
      query: `SELECT UPPER(LOWER(TRIM(REPLACE(REPLACE(content, 'old', 'new'), 'foo', 'bar'))))
              FROM large_text_table`,
      expectedOutcome: 'failure',
      expectedFailureType: 'performance',
      expectedDuration: 18000,
      timeWasted: 15,
      businessImpact: 'Chained string operations'
    },
    {
      id: 'perf_window_all_rows',
      name: 'Window function over all rows',
      query: `SELECT *, ROW_NUMBER() OVER (ORDER BY timestamp) as rn,
              RANK() OVER (ORDER BY amount) as rank
              FROM transactions`,
      expectedOutcome: 'failure',
      expectedFailureType: 'performance',
      expectedDuration: 22000,
      timeWasted: 18,
      businessImpact: 'Multiple unbounded windows'
    }
  ],

  successCases: [
    {
      id: 'success_simple_select',
      name: 'Simple SELECT with LIMIT',
      query: 'SELECT customer_id, name FROM customers WHERE active = true LIMIT 100',
      expectedOutcome: 'success',
      expectedDuration: 500,
      businessValue: 'Efficient query pattern'
    },
    {
      id: 'success_aggregation',
      name: 'Efficient aggregation',
      query: `SELECT DATE(created_at) as date, COUNT(*) as orders
              FROM orders
              WHERE created_at >= "2024-01-01"
              GROUP BY date
              ORDER BY date DESC
              LIMIT 30`,
      expectedOutcome: 'success',
      expectedDuration: 800,
      businessValue: 'Well-structured analytics query'
    },
    {
      id: 'success_partition_filter',
      name: 'Query with partition filter',
      query: `SELECT * FROM events
              WHERE DATE(_PARTITIONTIME) = "2024-01-15"
              AND user_id = 12345
              LIMIT 1000`,
      expectedOutcome: 'success',
      expectedDuration: 600,
      businessValue: 'Efficient partition usage'
    },
    {
      id: 'success_join_indexed',
      name: 'Indexed JOIN query',
      query: `SELECT o.order_id, o.total, c.name
              FROM orders o
              JOIN customers c ON o.customer_id = c.customer_id
              WHERE o.created_at >= CURRENT_DATE()
              LIMIT 100`,
      expectedOutcome: 'success',
      expectedDuration: 700,
      businessValue: 'Proper JOIN with filters'
    },
    {
      id: 'success_cte_optimized',
      name: 'Optimized CTE usage',
      query: `WITH daily_totals AS (
                SELECT DATE(created_at) as date, SUM(amount) as total
                FROM transactions
                WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
                GROUP BY date
              )
              SELECT * FROM daily_totals ORDER BY date DESC`,
      expectedOutcome: 'success',
      expectedDuration: 900,
      businessValue: 'Clean CTE pattern'
    },
    {
      id: 'success_count_query',
      name: 'Efficient count query',
      query: 'SELECT COUNT(*) as total FROM orders WHERE status = "completed"',
      expectedOutcome: 'success',
      expectedDuration: 400,
      businessValue: 'Simple aggregation'
    },
    {
      id: 'success_exists_check',
      name: 'EXISTS subquery',
      query: `SELECT customer_id FROM customers c
              WHERE EXISTS (
                SELECT 1 FROM orders o 
                WHERE o.customer_id = c.customer_id 
                AND o.created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
              )`,
      expectedOutcome: 'success',
      expectedDuration: 1000,
      businessValue: 'Efficient existence check'
    },
    {
      id: 'success_window_partitioned',
      name: 'Partitioned window function',
      query: `SELECT customer_id, order_id, amount,
              ROW_NUMBER() OVER (PARTITION BY customer_id ORDER BY created_at DESC) as recent_order
              FROM orders
              WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 90 DAY)`,
      expectedOutcome: 'success',
      expectedDuration: 1200,
      businessValue: 'Efficient window usage'
    },
    {
      id: 'success_array_agg',
      name: 'Array aggregation',
      query: `SELECT customer_id, ARRAY_AGG(product_id LIMIT 10) as recent_products
              FROM orders
              WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
              GROUP BY customer_id`,
      expectedOutcome: 'success',
      expectedDuration: 1100,
      businessValue: 'Modern BigQuery features'
    },
    {
      id: 'success_approx_query',
      name: 'Approximate aggregation',
      query: 'SELECT APPROX_COUNT_DISTINCT(user_id) as unique_users FROM events',
      expectedOutcome: 'success',
      expectedDuration: 300,
      businessValue: 'Performance optimization'
    }
  ]
};

// Flatten all scenarios for easy access
export const ALL_SCENARIOS = [
  ...TEST_SCENARIOS.syntaxErrors,
  ...TEST_SCENARIOS.permissionErrors,
  ...TEST_SCENARIOS.costOverruns,
  ...TEST_SCENARIOS.performanceIssues,
  ...TEST_SCENARIOS.successCases
];

// Helper to get scenarios by type
export function getScenariosByType(type) {
  return TEST_SCENARIOS[type] || [];
}

// Helper to get random scenarios
export function getRandomScenarios(count = 10) {
  const shuffled = [...ALL_SCENARIOS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Calculate expected metrics
export function calculateExpectedMetrics() {
  const totalScenarios = ALL_SCENARIOS.length;
  const failureScenarios = ALL_SCENARIOS.filter(s => s.expectedOutcome === 'failure');
  const successScenarios = ALL_SCENARIOS.filter(s => s.expectedOutcome === 'success');
  
  const syntaxErrors = TEST_SCENARIOS.syntaxErrors.length;
  const permissionErrors = TEST_SCENARIOS.permissionErrors.length;
  const costOverruns = TEST_SCENARIOS.costOverruns.length;
  const performanceIssues = TEST_SCENARIOS.performanceIssues.length;
  
  const totalTimeWasted = failureScenarios.reduce((sum, s) => sum + (s.timeWasted || 0), 0);
  const totalCostRisk = TEST_SCENARIOS.costOverruns.reduce((sum, s) => sum + (s.expectedCost || 0), 0);
  
  return {
    totalScenarios,
    failureScenarios: failureScenarios.length,
    successScenarios: successScenarios.length,
    syntaxErrors,
    permissionErrors,
    costOverruns,
    performanceIssues,
    totalTimeWasted,
    totalCostRisk,
    expectedAccuracy: 0.733 // 73.3% target
  };
}

export default TEST_SCENARIOS;