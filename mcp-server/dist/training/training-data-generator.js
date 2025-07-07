import winston from 'winston';
const logger = winston.createLogger({
    level: 'debug',
    format: winston.format.simple(),
    transports: [new winston.transports.Console()],
});
/**
 * Training Data Generator for BigQuery Failure Patterns
 */
export class TrainingDataGenerator {
    logger = logger.child({ component: 'TrainingDataGenerator' });
    /**
     * Generate comprehensive training dataset
     */
    generateTrainingData() {
        const patterns = [];
        // Syntax Error Patterns (25 patterns)
        patterns.push(...this.generateSyntaxErrorPatterns());
        // Permission Error Patterns (25 patterns)
        patterns.push(...this.generatePermissionErrorPatterns());
        // Cost Overrun Patterns (25 patterns)  
        patterns.push(...this.generateCostOverrunPatterns());
        // Performance Issue Patterns (25 patterns)
        patterns.push(...this.generatePerformanceIssuePatterns());
        // Cross-Region Query Patterns (15 patterns)
        patterns.push(...this.generateCrossRegionPatterns());
        // Success Patterns (35 patterns)
        patterns.push(...this.generateSuccessPatterns());
        this.logger.info('Generated training dataset', {
            totalPatterns: patterns.length,
            syntaxErrors: patterns.filter(p => p.failureType === 'syntax').length,
            permissionErrors: patterns.filter(p => p.failureType === 'permission').length,
            costOverruns: patterns.filter(p => p.failureType === 'cost').length,
            performanceIssues: patterns.filter(p => p.failureType === 'performance').length,
            crossRegionQueries: patterns.filter(p => p.failureType === 'region').length,
            successPatterns: patterns.filter(p => p.expectedOutcome === 'success').length
        });
        return patterns;
    }
    generateSyntaxErrorPatterns() {
        return [
            {
                id: 'syntax_001',
                scenario: 'Missing FROM clause',
                query: 'SELECT id, name WHERE id > 100',
                params: { query: 'SELECT id, name WHERE id > 100' },
                expectedOutcome: 'failure',
                expectedError: 'Syntax error: Expected keyword FROM',
                failureType: 'syntax',
                features: [0.1, 0.0, 0.3, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.8], // High syntax error signal
                targets: [0.0, 1.0, 0.0, 0.0] // [success_prob, failure_type_syntax, cost_factor, duration_factor]
            },
            {
                id: 'syntax_002',
                scenario: 'Invalid column reference',
                query: 'SELECT non_existent_column FROM dataset.table',
                params: { query: 'SELECT non_existent_column FROM dataset.table' },
                expectedOutcome: 'failure',
                expectedError: 'Column not found: non_existent_column',
                failureType: 'syntax',
                features: [0.1, 0.0, 0.3, 0.1, 0.2, 0.0, 0.0, 0.0, 0.0, 0.7],
                targets: [0.0, 1.0, 0.0, 0.0]
            },
            {
                id: 'syntax_003',
                scenario: 'Incorrect JOIN syntax',
                query: 'SELECT * FROM table1 JOIN ON table1.id = table2.id',
                params: { query: 'SELECT * FROM table1 JOIN ON table1.id = table2.id' },
                expectedOutcome: 'failure',
                expectedError: 'Syntax error: Expected table name after JOIN',
                failureType: 'syntax',
                features: [0.1, 0.0, 0.4, 0.1, 0.2, 0.0, 0.0, 0.0, 0.0, 0.6],
                targets: [0.0, 1.0, 0.0, 0.0]
            },
            {
                id: 'syntax_004',
                scenario: 'Missing SELECT keyword',
                query: 'FROM dataset.table WHERE id > 100',
                params: { query: 'FROM dataset.table WHERE id > 100' },
                expectedOutcome: 'failure',
                expectedError: 'Syntax error: Expected SELECT',
                failureType: 'syntax',
                features: [0.1, 0.0, 0.2, 0.0, 0.2, 0.0, 0.0, 0.0, 0.0, 0.9],
                targets: [0.0, 1.0, 0.0, 0.0]
            },
            {
                id: 'syntax_005',
                scenario: 'Unbalanced parentheses',
                query: 'SELECT * FROM dataset.table WHERE (id > 100 AND name = "test"',
                params: { query: 'SELECT * FROM dataset.table WHERE (id > 100 AND name = "test"' },
                expectedOutcome: 'failure',
                expectedError: 'Syntax error: Unbalanced parentheses',
                failureType: 'syntax',
                features: [0.1, 0.0, 0.3, 0.1, 0.2, 0.0, 0.0, 0.0, 0.0, 0.7],
                targets: [0.0, 1.0, 0.0, 0.0]
            },
            // Add more syntax error patterns...
            ...this.generateMoreSyntaxPatterns()
        ];
    }
    generatePermissionErrorPatterns() {
        return [
            {
                id: 'permission_001',
                scenario: 'Dataset access denied',
                query: 'SELECT * FROM restricted_dataset.table',
                params: {
                    query: 'SELECT * FROM restricted_dataset.table',
                    datasetId: 'restricted_dataset'
                },
                expectedOutcome: 'failure',
                expectedError: 'Permission denied on dataset',
                failureType: 'permission',
                features: [0.1, 0.0, 0.2, 0.1, 0.8, 0.0, 0.0, 0.0, 0.0, 0.0], // High permission risk
                targets: [0.0, 0.0, 1.0, 0.0] // [success_prob, syntax, permission_failure, cost_factor]
            },
            {
                id: 'permission_002',
                scenario: 'Table not found',
                query: 'SELECT * FROM public.non_existent_table',
                params: {
                    operation: 'describe-table',
                    dataset: 'public',
                    table: 'non_existent_table'
                },
                expectedOutcome: 'failure',
                expectedError: 'Table not found',
                failureType: 'permission',
                features: [0.1, 0.0, 0.2, 0.1, 0.6, 0.0, 0.0, 0.0, 0.0, 0.0],
                targets: [0.0, 0.0, 1.0, 0.0]
            },
            {
                id: 'permission_003',
                scenario: 'System table access',
                query: 'SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE table_schema = "restricted"',
                params: { query: 'SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE table_schema = "restricted"' },
                expectedOutcome: 'failure',
                expectedError: 'Permission denied on system table',
                failureType: 'permission',
                features: [0.1, 0.0, 0.3, 0.1, 0.7, 0.0, 0.0, 0.0, 0.0, 0.0],
                targets: [0.0, 0.0, 1.0, 0.0]
            },
            // Add more permission error patterns...
            ...this.generateMorePermissionPatterns()
        ];
    }
    generateCostOverrunPatterns() {
        return [
            {
                id: 'cost_001',
                scenario: 'Large table scan without filter',
                query: 'SELECT * FROM project.dataset.billion_row_table',
                params: { query: 'SELECT * FROM project.dataset.billion_row_table' },
                expectedOutcome: 'failure',
                expectedError: 'Query would scan 1.2TB',
                expectedCost: 6.0,
                failureType: 'cost',
                features: [0.1, 0.0, 0.2, 0.1, 0.0, 0.0, 0.0, 0.9, 0.0, 0.0], // High cost risk
                targets: [0.0, 0.0, 0.0, 1.0] // [success_prob, syntax, permission, cost_failure]
            },
            {
                id: 'cost_002',
                scenario: 'Cartesian join',
                query: 'SELECT * FROM table1, table2, table3',
                params: { query: 'SELECT * FROM table1, table2, table3' },
                expectedOutcome: 'failure',
                expectedError: 'Cartesian joins are not recommended',
                expectedCost: 15.0,
                failureType: 'cost',
                features: [0.1, 0.0, 0.4, 0.3, 0.0, 0.0, 0.0, 0.8, 0.0, 0.0],
                targets: [0.0, 0.0, 0.0, 1.0]
            },
            {
                id: 'cost_003',
                scenario: 'Full table scan without LIMIT',
                query: 'SELECT * FROM massive_table ORDER BY timestamp',
                params: { query: 'SELECT * FROM massive_table ORDER BY timestamp' },
                expectedOutcome: 'failure',
                expectedError: 'Query would scan entire table',
                expectedCost: 8.5,
                failureType: 'cost',
                features: [0.1, 0.0, 0.2, 0.1, 0.0, 0.0, 0.0, 0.7, 0.0, 0.0],
                targets: [0.0, 0.0, 0.0, 1.0]
            },
            // Add more cost overrun patterns...
            ...this.generateMoreCostPatterns()
        ];
    }
    generatePerformanceIssuePatterns() {
        return [
            {
                id: 'performance_001',
                scenario: 'Query timeout',
                query: 'SELECT * FROM massive_table CROSS JOIN another_massive_table',
                params: {
                    query: 'SELECT * FROM massive_table CROSS JOIN another_massive_table',
                    timeout: 1000
                },
                expectedOutcome: 'failure',
                expectedError: 'Query exceeded timeout',
                expectedDuration: 1000,
                failureType: 'performance',
                features: [0.1, 0.0, 0.5, 0.4, 0.0, 0.0, 0.0, 0.6, 0.8, 0.0], // High performance risk
                targets: [0.0, 0.0, 0.0, 0.8] // High duration factor
            },
            {
                id: 'performance_002',
                scenario: 'Memory exceeded',
                query: 'SELECT ARRAY_AGG(data ORDER BY rand()) FROM huge_table',
                params: { query: 'SELECT ARRAY_AGG(data ORDER BY rand()) FROM huge_table' },
                expectedOutcome: 'failure',
                expectedError: 'Resources exceeded: Memory',
                failureType: 'performance',
                features: [0.1, 0.0, 0.3, 0.2, 0.0, 0.0, 0.0, 0.5, 0.7, 0.0],
                targets: [0.0, 0.0, 0.0, 0.7]
            },
            // Add more performance issue patterns...
            ...this.generateMorePerformancePatterns()
        ];
    }
    generateCrossRegionPatterns() {
        return [
            {
                id: 'region_001',
                scenario: 'Cross-region query US to EU',
                query: 'SELECT * FROM `us-central1.data.table` UNION ALL SELECT * FROM `eu-west1.data.table`',
                params: {
                    query: 'SELECT * FROM `us-central1.data.table` UNION ALL SELECT * FROM `eu-west1.data.table`',
                    location: 'us-central1'
                },
                expectedOutcome: 'failure',
                expectedError: 'Cross-region query detected',
                failureType: 'region',
                features: [0.1, 0.0, 0.3, 0.2, 0.0, 0.0, 0.8, 0.3, 0.0, 0.0], // High region risk
                targets: [0.0, 0.0, 0.0, 0.3]
            },
            {
                id: 'region_002',
                scenario: 'Cross-region query Asia to US',
                query: 'SELECT * FROM `asia-northeast1.data.table` JOIN `us-central1.data.table` ON id',
                params: {
                    query: 'SELECT * FROM `asia-northeast1.data.table` JOIN `us-central1.data.table` ON id',
                    location: 'asia-northeast1'
                },
                expectedOutcome: 'failure',
                expectedError: 'Cross-region query detected',
                failureType: 'region',
                features: [0.1, 0.0, 0.4, 0.2, 0.0, 0.0, 0.9, 0.4, 0.0, 0.0],
                targets: [0.0, 0.0, 0.0, 0.4]
            },
            // Add more cross-region patterns...
            ...this.generateMoreRegionPatterns()
        ];
    }
    generateSuccessPatterns() {
        return [
            {
                id: 'success_001',
                scenario: 'Simple SELECT with LIMIT',
                query: 'SELECT id, name FROM dataset.users LIMIT 10',
                params: { query: 'SELECT id, name FROM dataset.users LIMIT 10' },
                expectedOutcome: 'success',
                expectedCost: 0.0,
                expectedDuration: 500,
                features: [0.1, 0.8, 0.2, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0], // High success indicators
                targets: [1.0, 0.0, 0.0, 0.1] // [high_success_prob, no_failure_type, no_cost_issue, low_duration]
            },
            {
                id: 'success_002',
                scenario: 'Filtered query with WHERE',
                query: 'SELECT * FROM dataset.orders WHERE created_date > "2023-01-01" LIMIT 100',
                params: { query: 'SELECT * FROM dataset.orders WHERE created_date > "2023-01-01" LIMIT 100' },
                expectedOutcome: 'success',
                expectedCost: 0.05,
                expectedDuration: 800,
                features: [0.1, 0.7, 0.3, 0.1, 0.0, 0.0, 0.0, 0.2, 0.0, 0.0],
                targets: [0.9, 0.0, 0.0, 0.2]
            },
            {
                id: 'success_003',
                scenario: 'Simple aggregation',
                query: 'SELECT COUNT(*) FROM dataset.users WHERE active = true',
                params: { query: 'SELECT COUNT(*) FROM dataset.users WHERE active = true' },
                expectedOutcome: 'success',
                expectedCost: 0.02,
                expectedDuration: 300,
                features: [0.1, 0.9, 0.2, 0.1, 0.0, 0.0, 0.0, 0.1, 0.0, 0.0],
                targets: [0.95, 0.0, 0.0, 0.1]
            },
            // Add more success patterns...
            ...this.generateMoreSuccessPatterns()
        ];
    }
    // Helper methods to generate more patterns of each type
    generateMoreSyntaxPatterns() {
        // Generate 20 more syntax error patterns
        const patterns = [];
        const syntaxErrors = [
            'Invalid GROUP BY clause',
            'Missing quotes around string',
            'Invalid aggregate function',
            'Incorrect ORDER BY syntax',
            'Missing table alias',
            'Invalid date format',
            'Incorrect CASE syntax',
            'Missing END in CASE',
            'Invalid window function',
            'Incorrect subquery syntax'
        ];
        for (let i = 0; i < 20; i++) {
            patterns.push({
                id: `syntax_${String(i + 6).padStart(3, '0')}`,
                scenario: syntaxErrors[i % syntaxErrors.length],
                query: `SELECT * FROM table WHERE invalid_syntax_${i}`,
                params: { query: `SELECT * FROM table WHERE invalid_syntax_${i}` },
                expectedOutcome: 'failure',
                expectedError: syntaxErrors[i % syntaxErrors.length],
                failureType: 'syntax',
                features: [0.1, 0.0, 0.3, 0.1, 0.0, 0.0, 0.0, 0.0, 0.0, 0.6 + (i % 5) * 0.1],
                targets: [0.0, 1.0, 0.0, 0.0]
            });
        }
        return patterns;
    }
    generateMorePermissionPatterns() {
        // Generate 22 more permission error patterns
        const patterns = [];
        const permissionErrors = [
            'Dataset access denied',
            'Table not found',
            'View access denied',
            'Function access denied',
            'Project access denied'
        ];
        for (let i = 0; i < 22; i++) {
            patterns.push({
                id: `permission_${String(i + 4).padStart(3, '0')}`,
                scenario: permissionErrors[i % permissionErrors.length],
                query: `SELECT * FROM restricted_table_${i}`,
                params: { query: `SELECT * FROM restricted_table_${i}` },
                expectedOutcome: 'failure',
                expectedError: permissionErrors[i % permissionErrors.length],
                failureType: 'permission',
                features: [0.1, 0.0, 0.2, 0.1, 0.5 + (i % 5) * 0.1, 0.0, 0.0, 0.0, 0.0, 0.0],
                targets: [0.0, 0.0, 1.0, 0.0]
            });
        }
        return patterns;
    }
    generateMoreCostPatterns() {
        // Generate 22 more cost overrun patterns
        const patterns = [];
        const costErrors = [
            'Large table scan',
            'Cartesian join detected',
            'Full table scan without filter',
            'Expensive aggregation',
            'Cross join detected'
        ];
        for (let i = 0; i < 22; i++) {
            patterns.push({
                id: `cost_${String(i + 4).padStart(3, '0')}`,
                scenario: costErrors[i % costErrors.length],
                query: `SELECT * FROM massive_table_${i} CROSS JOIN another_table`,
                params: { query: `SELECT * FROM massive_table_${i} CROSS JOIN another_table` },
                expectedOutcome: 'failure',
                expectedError: costErrors[i % costErrors.length],
                expectedCost: 5.0 + (i % 10),
                failureType: 'cost',
                features: [0.1, 0.0, 0.3, 0.2, 0.0, 0.0, 0.0, 0.6 + (i % 5) * 0.08, 0.0, 0.0],
                targets: [0.0, 0.0, 0.0, 1.0]
            });
        }
        return patterns;
    }
    generateMorePerformancePatterns() {
        // Generate 23 more performance issue patterns
        const patterns = [];
        const performanceErrors = [
            'Query timeout',
            'Memory exceeded',
            'CPU limit exceeded',
            'Too many concurrent queries',
            'Resource exhaustion'
        ];
        for (let i = 0; i < 23; i++) {
            patterns.push({
                id: `performance_${String(i + 3).padStart(3, '0')}`,
                scenario: performanceErrors[i % performanceErrors.length],
                query: `SELECT complex_function_${i}(*) FROM huge_table GROUP BY many_columns`,
                params: { query: `SELECT complex_function_${i}(*) FROM huge_table GROUP BY many_columns` },
                expectedOutcome: 'failure',
                expectedError: performanceErrors[i % performanceErrors.length],
                failureType: 'performance',
                features: [0.1, 0.0, 0.4, 0.3, 0.0, 0.0, 0.0, 0.5, 0.6 + (i % 5) * 0.08, 0.0],
                targets: [0.0, 0.0, 0.0, 0.7 + (i % 5) * 0.06]
            });
        }
        return patterns;
    }
    generateMoreRegionPatterns() {
        // Generate 13 more cross-region patterns
        const patterns = [];
        const regions = ['us-central1', 'eu-west1', 'asia-northeast1', 'us-east1', 'europe-west1'];
        for (let i = 0; i < 13; i++) {
            const region1 = regions[i % regions.length];
            const region2 = regions[(i + 1) % regions.length];
            patterns.push({
                id: `region_${String(i + 3).padStart(3, '0')}`,
                scenario: `Cross-region query ${region1} to ${region2}`,
                query: `SELECT * FROM \`${region1}.data.table\` UNION \`${region2}.data.table\``,
                params: {
                    query: `SELECT * FROM \`${region1}.data.table\` UNION \`${region2}.data.table\``,
                    location: region1
                },
                expectedOutcome: 'failure',
                expectedError: 'Cross-region query detected',
                failureType: 'region',
                features: [0.1, 0.0, 0.3, 0.2, 0.0, 0.0, 0.7 + (i % 5) * 0.06, 0.3, 0.0, 0.0],
                targets: [0.0, 0.0, 0.0, 0.3 + (i % 5) * 0.04]
            });
        }
        return patterns;
    }
    generateMoreSuccessPatterns() {
        // Generate 32 more success patterns
        const patterns = [];
        const successQueries = [
            'Simple SELECT with LIMIT',
            'Filtered query with WHERE',
            'Simple aggregation',
            'JOIN with proper conditions',
            'Subquery with LIMIT'
        ];
        for (let i = 0; i < 32; i++) {
            patterns.push({
                id: `success_${String(i + 4).padStart(3, '0')}`,
                scenario: successQueries[i % successQueries.length],
                query: `SELECT col1, col2 FROM dataset.table_${i} WHERE id > ${i * 10} LIMIT ${100 + i * 10}`,
                params: { query: `SELECT col1, col2 FROM dataset.table_${i} WHERE id > ${i * 10} LIMIT ${100 + i * 10}` },
                expectedOutcome: 'success',
                expectedCost: 0.01 + (i % 10) * 0.01,
                expectedDuration: 200 + (i % 20) * 50,
                features: [0.1, 0.7 + (i % 5) * 0.06, 0.2, 0.1, 0.0, 0.0, 0.0, 0.05 + (i % 10) * 0.01, 0.0, 0.0],
                targets: [0.8 + (i % 10) * 0.02, 0.0, 0.0, 0.1 + (i % 20) * 0.01]
            });
        }
        return patterns;
    }
    /**
     * Convert SQL query to feature vector using intelligent extraction
     */
    queryToFeatures(query, params, sqlAnalysis) {
        const features = [];
        // Feature 0: Query type encoding
        const queryTypeMap = {
            'SELECT': 0.1, 'INSERT': 0.2, 'UPDATE': 0.3, 'DELETE': 0.4, 'CREATE': 0.5, 'DROP': 0.6
        };
        features.push(queryTypeMap[sqlAnalysis.queryType] || 0.0);
        // Feature 1: Syntax health score
        features.push(sqlAnalysis.syntaxScore);
        // Feature 2: Query complexity
        features.push(sqlAnalysis.complexityScore);
        // Feature 3: JOIN complexity
        features.push(Math.min(1.0, sqlAnalysis.joinCount / 5.0));
        // Feature 4: Permission risk
        features.push(sqlAnalysis.permissionRisk);
        // Feature 5: Table count normalized
        features.push(Math.min(1.0, sqlAnalysis.tableCount / 10.0));
        // Feature 6: Cross-region risk
        features.push(sqlAnalysis.crossRegionTables.length > 0 ? 1.0 : 0.0);
        // Feature 7: Cost risk
        features.push(sqlAnalysis.costRisk);
        // Feature 8: Performance risk
        features.push(sqlAnalysis.performanceRisk);
        // Feature 9: Structure completeness (has FROM, WHERE, proper syntax)
        const structureScore = ((sqlAnalysis.hasFrom ? 0.3 : 0.0) +
            (sqlAnalysis.hasWhere ? 0.2 : 0.0) +
            (sqlAnalysis.hasLimit ? 0.1 : 0.0) +
            (sqlAnalysis.syntaxErrors.length === 0 ? 0.4 : 0.0));
        features.push(structureScore);
        // Ensure exactly 10 features
        while (features.length < 10) {
            features.push(0.0);
        }
        return features.slice(0, 10);
    }
    /**
     * Generate targets for training based on expected outcome
     */
    generateTargets(pattern) {
        const targets = [0.0, 0.0, 0.0, 0.0];
        if (pattern.expectedOutcome === 'success') {
            targets[0] = 0.8 + Math.random() * 0.2; // Success probability 0.8-1.0
            targets[1] = 0.0; // No failure type
            targets[2] = Math.min(1.0, (pattern.expectedCost || 0) / 10.0); // Cost factor
            targets[3] = Math.min(1.0, (pattern.expectedDuration || 1000) / 10000.0); // Duration factor
        }
        else {
            targets[0] = 0.0 + Math.random() * 0.3; // Low success probability 0.0-0.3
            // Set failure type encoding
            switch (pattern.failureType) {
                case 'syntax':
                    targets[1] = 1.0;
                    break;
                case 'permission':
                    targets[2] = 1.0;
                    break;
                case 'cost':
                    targets[3] = 1.0;
                    break;
                case 'performance':
                    targets[3] = 0.8 + Math.random() * 0.2;
                    break;
                case 'region':
                    targets[3] = 0.4 + Math.random() * 0.2;
                    break;
            }
        }
        return targets;
    }
}
//# sourceMappingURL=training-data-generator.js.map