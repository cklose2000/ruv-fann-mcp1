import Database from 'better-sqlite3';
import winston from 'winston';
export class GCPPatternStorage {
    db;
    logger;
    constructor(dbPath = './data/gcp-patterns.db') {
        this.db = new Database(dbPath);
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(winston.format.timestamp(), winston.format.json()),
            transports: [
                new winston.transports.File({ filename: 'gcp-pattern-storage.log' }),
            ],
        });
        this.initializeTables();
    }
    initializeTables() {
        // Command patterns table
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS gcp_command_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        params TEXT NOT NULL,
        context TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('success', 'failure')),
        duration INTEGER NOT NULL,
        error TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        cost_estimate REAL,
        rows_processed INTEGER,
        auth_token_age INTEGER
      )
    `);
        // BigQuery query patterns
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS gcp_query_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        query_type TEXT NOT NULL,
        table_size_gb REAL,
        execution_time_ms INTEGER NOT NULL,
        cost_usd REAL,
        rows_returned INTEGER NOT NULL,
        success BOOLEAN NOT NULL,
        error_type TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Authentication patterns
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS gcp_auth_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        token_age_minutes INTEGER NOT NULL,
        operation_type TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        error_message TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Quota usage patterns
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS gcp_quota_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        resource_type TEXT NOT NULL,
        usage_level REAL NOT NULL,
        operation_type TEXT NOT NULL,
        success BOOLEAN NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // User behavior patterns
        this.db.exec(`
      CREATE TABLE IF NOT EXISTS gcp_user_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL UNIQUE,
        common_projects TEXT NOT NULL,
        frequent_datasets TEXT NOT NULL,
        typical_operations TEXT NOT NULL,
        error_patterns TEXT NOT NULL,
        last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
        // Create indexes for performance
        this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_command_tool ON gcp_command_patterns(tool);
      CREATE INDEX IF NOT EXISTS idx_command_outcome ON gcp_command_patterns(outcome);
      CREATE INDEX IF NOT EXISTS idx_command_timestamp ON gcp_command_patterns(timestamp);
      CREATE INDEX IF NOT EXISTS idx_query_type ON gcp_query_patterns(query_type);
      CREATE INDEX IF NOT EXISTS idx_auth_token_age ON gcp_auth_patterns(token_age_minutes);
      CREATE INDEX IF NOT EXISTS idx_quota_resource ON gcp_quota_patterns(resource_type);
    `);
        this.logger.info('GCP pattern storage tables initialized');
    }
    // Command pattern methods
    async recordCommandPattern(pattern) {
        const stmt = this.db.prepare(`
      INSERT INTO gcp_command_patterns 
      (tool, params, context, outcome, duration, error, cost_estimate, rows_processed, auth_token_age)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(pattern.tool, JSON.stringify(pattern.params), JSON.stringify(pattern.context), pattern.outcome, pattern.duration, pattern.error, pattern.cost_estimate, pattern.rows_processed, pattern.auth_token_age);
        this.logger.info('Recorded GCP command pattern', {
            id: result.lastInsertRowid,
            tool: pattern.tool,
            outcome: pattern.outcome
        });
        return result.lastInsertRowid;
    }
    async getSimilarCommands(tool, params, limit = 10) {
        const stmt = this.db.prepare(`
      SELECT * FROM gcp_command_patterns 
      WHERE tool = ? 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
        const rows = stmt.all(tool, limit);
        return rows.map(row => ({
            ...row,
            params: JSON.parse(row.params),
            context: JSON.parse(row.context),
            timestamp: new Date(row.timestamp)
        }));
    }
    async getSuccessfulPatterns(tool, limit = 10) {
        const stmt = this.db.prepare(`
      SELECT * FROM gcp_command_patterns 
      WHERE tool = ? AND outcome = 'success' 
      ORDER BY timestamp DESC 
      LIMIT ?
    `);
        const rows = stmt.all(tool, limit);
        return rows.map(row => ({
            ...row,
            params: JSON.parse(row.params),
            context: JSON.parse(row.context),
            timestamp: new Date(row.timestamp)
        }));
    }
    // BigQuery pattern methods
    async recordQueryPattern(pattern) {
        const stmt = this.db.prepare(`
      INSERT INTO gcp_query_patterns 
      (query_type, table_size_gb, execution_time_ms, cost_usd, rows_returned, success, error_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
        const result = stmt.run(pattern.query_type, pattern.table_size_gb, pattern.execution_time_ms, pattern.cost_usd, pattern.rows_returned, pattern.success ? 1 : 0, // Convert boolean to number for SQLite
        pattern.error_type);
        return result.lastInsertRowid;
    }
    async predictQueryCost(queryType, tableSizeGb) {
        let query = `
      SELECT AVG(cost_usd) as avg_cost, COUNT(*) as count
      FROM gcp_query_patterns 
      WHERE query_type = ? AND cost_usd IS NOT NULL
    `;
        let params = [queryType];
        if (tableSizeGb) {
            query += ` AND table_size_gb BETWEEN ? AND ?`;
            params.push(tableSizeGb * 0.8, tableSizeGb * 1.2); // 20% tolerance
        }
        const stmt = this.db.prepare(query);
        const result = stmt.get(...params);
        return {
            avgCost: result.avg_cost || 0,
            confidence: Math.min(result.count / 10, 1.0) // Max confidence with 10+ samples
        };
    }
    // Auth pattern methods
    async recordAuthPattern(pattern) {
        const stmt = this.db.prepare(`
      INSERT INTO gcp_auth_patterns 
      (token_age_minutes, operation_type, success, error_message)
      VALUES (?, ?, ?, ?)
    `);
        const result = stmt.run(pattern.token_age_minutes, pattern.operation_type, pattern.success ? 1 : 0, // Convert boolean to number for SQLite
        pattern.error_message);
        return result.lastInsertRowid;
    }
    async predictAuthFailure(tokenAgeMinutes) {
        const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures
      FROM gcp_auth_patterns 
      WHERE token_age_minutes BETWEEN ? AND ?
    `);
        const result = stmt.get(tokenAgeMinutes - 5, tokenAgeMinutes + 5);
        if (result.total === 0) {
            return { failureProbability: 0, confidence: 0 };
        }
        return {
            failureProbability: result.failures / result.total,
            confidence: Math.min(result.total / 20, 1.0) // Max confidence with 20+ samples
        };
    }
    // User pattern methods
    async updateUserPatterns(userId, updates) {
        const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO gcp_user_patterns 
      (user_id, common_projects, frequent_datasets, typical_operations, error_patterns, last_updated)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `);
        stmt.run(userId, JSON.stringify(updates.common_projects || []), JSON.stringify(updates.frequent_datasets || []), JSON.stringify(updates.typical_operations || []), JSON.stringify(updates.error_patterns || []));
    }
    async getUserPatterns(userId) {
        const stmt = this.db.prepare(`
      SELECT * FROM gcp_user_patterns WHERE user_id = ?
    `);
        const result = stmt.get(userId);
        if (!result)
            return null;
        return {
            ...result,
            common_projects: JSON.parse(result.common_projects),
            frequent_datasets: JSON.parse(result.frequent_datasets),
            typical_operations: JSON.parse(result.typical_operations),
            error_patterns: JSON.parse(result.error_patterns),
            last_updated: new Date(result.last_updated)
        };
    }
    // Statistics and analytics
    async getPatternStatistics() {
        const totalCommands = this.db.prepare('SELECT COUNT(*) as count FROM gcp_command_patterns').get();
        const successRate = this.db.prepare(`
      SELECT 
        (COUNT(CASE WHEN outcome = 'success' THEN 1 END) * 100.0 / COUNT(*)) as rate
      FROM gcp_command_patterns
    `).get();
        const avgDuration = this.db.prepare('SELECT AVG(duration) as avg FROM gcp_command_patterns').get();
        const topErrors = this.db.prepare(`
      SELECT error, COUNT(*) as count 
      FROM gcp_command_patterns 
      WHERE outcome = 'failure' AND error IS NOT NULL
      GROUP BY error 
      ORDER BY count DESC 
      LIMIT 5
    `).all();
        return {
            totalCommands: totalCommands.count,
            successRate: successRate.rate || 0,
            avgDuration: avgDuration.avg || 0,
            topErrors
        };
    }
    // Cleanup old patterns
    async cleanupOldPatterns(daysToKeep = 90) {
        const stmt = this.db.prepare(`
      DELETE FROM gcp_command_patterns 
      WHERE timestamp < datetime('now', '-' || ? || ' days')
    `);
        const result = stmt.run(daysToKeep);
        this.logger.info('Cleaned up old patterns', { deletedRows: result.changes });
        return result.changes;
    }
    // Analytics methods
    async getAverageQueryDuration(queryType) {
        const stmt = this.db.prepare(`
      SELECT AVG(execution_time_ms) as avg_duration
      FROM gcp_query_patterns 
      WHERE query_type = ? AND success = 1
    `);
        const result = stmt.get(queryType);
        return result?.avg_duration || 0;
    }
    async getQuerySuccessRate(queryType) {
        const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 1 THEN 1 ELSE 0 END) as successes
      FROM gcp_query_patterns 
      WHERE query_type = ?
    `);
        const result = stmt.get(queryType);
        return result.total > 0 ? result.successes / result.total : 0;
    }
    async getAuthFailureRate(tokenAgeMinutes) {
        const stmt = this.db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN success = 0 THEN 1 ELSE 0 END) as failures
      FROM gcp_auth_patterns 
      WHERE token_age_minutes >= ?
    `);
        const result = stmt.get(tokenAgeMinutes);
        return result.total > 0 ? result.failures / result.total : 0;
    }
    close() {
        this.db.close();
        this.logger.info('GCP pattern storage closed');
    }
}
//# sourceMappingURL=gcp-pattern-storage.js.map