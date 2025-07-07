import Database from 'better-sqlite3';
import { GCPCommandPattern, GCPQueryPattern } from '../../src/storage/gcp-pattern-storage.js';
import { MockFactory } from '../utils/mock-factory.js';
import fs from 'fs';
import path from 'path';

/**
 * Generate test data for pattern databases
 */
export class TestDataGenerator {
  private patternDb: Database.Database;
  private gcpPatternDb: Database.Database;

  constructor(patternDbPath?: string, gcpPatternDbPath?: string) {
    const dataDir = path.join(process.cwd(), 'tests', 'fixtures', 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.patternDb = new Database(patternDbPath || path.join(dataDir, 'test_patterns.db'));
    this.gcpPatternDb = new Database(gcpPatternDbPath || path.join(dataDir, 'test_gcp_patterns.db'));
    
    this.initializeDatabases();
  }

  private initializeDatabases(): void {
    // Initialize pattern database
    this.patternDb.exec(`
      CREATE TABLE IF NOT EXISTS patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        params TEXT NOT NULL,
        context TEXT,
        outcome TEXT NOT NULL,
        duration INTEGER NOT NULL,
        error TEXT,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Initialize GCP pattern database (copy from GCPPatternStorage)
    this.gcpPatternDb.exec(`
      CREATE TABLE IF NOT EXISTS gcp_command_patterns (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        tool TEXT NOT NULL,
        params TEXT NOT NULL,
        context TEXT NOT NULL,
        outcome TEXT NOT NULL,
        duration INTEGER NOT NULL,
        error TEXT,
        cost_estimate REAL,
        rows_processed INTEGER,
        auth_token_age INTEGER,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    this.gcpPatternDb.exec(`
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
  }

  /**
   * Seed databases with test patterns
   */
  async seedTestData(): Promise<void> {
    console.log('Seeding test databases...');
    
    // Seed historical patterns
    await this.seedHistoricalPatterns();
    
    // Seed GCP-specific patterns
    await this.seedGCPPatterns();
    
    // Seed query patterns
    await this.seedQueryPatterns();
    
    console.log('Test data seeding complete!');
  }

  private async seedHistoricalPatterns(): Promise<void> {
    const patterns = [
      ...MockFactory.createBigQuerySuccessPatterns(),
      ...MockFactory.createBigQueryFailurePatterns(),
      ...MockFactory.createAuthFailurePatterns(),
      ...MockFactory.createEdgeCasePatterns(),
    ];

    const stmt = this.patternDb.prepare(`
      INSERT INTO patterns (tool, params, context, outcome, duration, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    for (const pattern of patterns) {
      // Create multiple historical instances of each pattern
      for (let i = 0; i < 5; i++) {
        const duration = pattern.expectedDuration || Math.floor(Math.random() * 5000);
        const timestamp = new Date(Date.now() - i * 24 * 60 * 60 * 1000); // Spread over days
        
        stmt.run(
          pattern.tool,
          JSON.stringify(pattern.params),
          JSON.stringify({ timestamp: timestamp.getTime() }),
          pattern.expectedOutcome,
          duration + Math.floor(Math.random() * 500 - 250), // Add variance
          pattern.expectedError
        );
      }
    }
  }

  private async seedGCPPatterns(): Promise<void> {
    const stmt = this.gcpPatternDb.prepare(`
      INSERT INTO gcp_command_patterns 
      (tool, params, context, outcome, duration, error, cost_estimate, rows_processed, auth_token_age)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Generate various GCP command patterns
    const tools = ['bq-query', 'bq-list-datasets', 'bq-list-tables', 'gcp-sql'];
    
    for (const tool of tools) {
      // Success patterns
      for (let i = 0; i < 20; i++) {
        stmt.run(
          tool,
          JSON.stringify(MockFactory.generateRandomParams(tool)),
          JSON.stringify({ timestamp: Date.now() - i * 60000 }),
          'success',
          Math.floor(Math.random() * 3000) + 500,
          null,
          Math.random() * 0.5, // Cost 0-0.5
          Math.floor(Math.random() * 10000), // Rows 0-10000
          Math.floor(Math.random() * 60) // Token age 0-60 minutes
        );
      }
      
      // Failure patterns
      for (let i = 0; i < 10; i++) {
        const errors = [
          'Permission denied',
          'Table not found',
          'Syntax error',
          'Quota exceeded',
          'Timeout',
        ];
        
        stmt.run(
          tool,
          JSON.stringify(MockFactory.generateRandomParams(tool)),
          JSON.stringify({ timestamp: Date.now() - i * 60000 }),
          'failure',
          Math.floor(Math.random() * 5000) + 1000,
          errors[Math.floor(Math.random() * errors.length)],
          null,
          0,
          Math.floor(Math.random() * 120) // Token age 0-120 minutes (older tokens fail more)
        );
      }
    }
  }

  private async seedQueryPatterns(): Promise<void> {
    const stmt = this.gcpPatternDb.prepare(`
      INSERT INTO gcp_query_patterns 
      (query_type, table_size_gb, execution_time_ms, cost_usd, rows_returned, success, error_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const queryTypes = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'JOIN', 'AGGREGATE'];
    
    for (const queryType of queryTypes) {
      // Success patterns with varying table sizes
      for (let i = 0; i < 15; i++) {
        const tableSize = Math.pow(10, Math.random() * 3); // 1MB to 1TB
        const cost = tableSize * 0.005; // $5 per TB
        const executionTime = tableSize * 10 + Math.random() * 1000;
        
        stmt.run(
          queryType,
          tableSize,
          Math.floor(executionTime),
          cost,
          Math.floor(Math.random() * 1000000),
          true,
          null
        );
      }
      
      // Failure patterns
      for (let i = 0; i < 5; i++) {
        const errorTypes = ['SYNTAX_ERROR', 'PERMISSION_DENIED', 'RESOURCE_EXHAUSTED', 'TIMEOUT'];
        
        stmt.run(
          queryType,
          Math.random() * 100,
          Math.floor(Math.random() * 10000),
          null,
          0,
          false,
          errorTypes[Math.floor(Math.random() * errorTypes.length)]
        );
      }
    }
  }

  /**
   * Generate specific test scenarios
   */
  generateScenarioData(scenario: string): void {
    switch (scenario) {
      case 'high_failure_rate':
        this.generateHighFailureData();
        break;
      case 'cost_overruns':
        this.generateCostOverrunData();
        break;
      case 'auth_failures':
        this.generateAuthFailureData();
        break;
      case 'performance_degradation':
        this.generatePerformanceDegradationData();
        break;
    }
  }

  private generateHighFailureData(): void {
    const stmt = this.gcpPatternDb.prepare(`
      INSERT INTO gcp_command_patterns 
      (tool, params, context, outcome, duration, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Generate 80% failure rate for specific tool
    for (let i = 0; i < 100; i++) {
      const outcome = i < 80 ? 'failure' : 'success';
      stmt.run(
        'bq-query',
        JSON.stringify({ query: 'SELECT * FROM problematic_table' }),
        JSON.stringify({ timestamp: Date.now() - i * 1000 }),
        outcome,
        outcome === 'failure' ? 5000 : 1000,
        outcome === 'failure' ? 'Table scan timeout' : null
      );
    }
  }

  private generateCostOverrunData(): void {
    const stmt = this.gcpPatternDb.prepare(`
      INSERT INTO gcp_query_patterns 
      (query_type, table_size_gb, execution_time_ms, cost_usd, rows_returned, success, error_type)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Generate patterns with increasing costs
    for (let i = 0; i < 50; i++) {
      const tableSize = Math.pow(10, i / 10); // Exponentially growing
      const cost = tableSize * 0.005;
      
      stmt.run(
        'SELECT',
        tableSize,
        Math.floor(tableSize * 100),
        cost,
        Math.floor(tableSize * 1000),
        true,
        null
      );
    }
  }

  private generateAuthFailureData(): void {
    const stmt = this.gcpPatternDb.prepare(`
      INSERT INTO gcp_command_patterns 
      (tool, params, context, outcome, duration, error, auth_token_age)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    // Generate patterns showing auth failures with old tokens
    for (let tokenAge = 0; tokenAge <= 120; tokenAge += 5) {
      const failureRate = tokenAge > 60 ? 0.8 : 0.1;
      
      for (let i = 0; i < 10; i++) {
        const outcome = Math.random() < failureRate ? 'failure' : 'success';
        stmt.run(
          'bq-list-datasets',
          JSON.stringify({ projectId: 'test-project' }),
          JSON.stringify({ timestamp: Date.now() }),
          outcome,
          outcome === 'failure' ? 1000 : 200,
          outcome === 'failure' ? 'Authentication failed' : null,
          tokenAge
        );
      }
    }
  }

  private generatePerformanceDegradationData(): void {
    const stmt = this.gcpPatternDb.prepare(`
      INSERT INTO gcp_command_patterns 
      (tool, params, context, outcome, duration, error)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    // Generate patterns showing gradual performance degradation
    const baseTime = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days ago
    
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const timestamp = baseTime + (day * 24 + hour) * 60 * 60 * 1000;
        const degradation = 1 + (day * 0.2); // 20% slower each day
        
        stmt.run(
          'bq-query',
          JSON.stringify({ query: 'SELECT COUNT(*) FROM dataset.table' }),
          JSON.stringify({ timestamp }),
          'success',
          Math.floor(500 * degradation),
          null
        );
      }
    }
  }

  /**
   * Get statistics about seeded data
   */
  getDataStats(): any {
    const stats = {
      patterns: {
        total: this.patternDb.prepare('SELECT COUNT(*) as count FROM patterns').get(),
        byTool: this.patternDb.prepare('SELECT tool, COUNT(*) as count FROM patterns GROUP BY tool').all(),
        byOutcome: this.patternDb.prepare('SELECT outcome, COUNT(*) as count FROM patterns GROUP BY outcome').all(),
      },
      gcpPatterns: {
        commands: this.gcpPatternDb.prepare('SELECT COUNT(*) as count FROM gcp_command_patterns').get(),
        queries: this.gcpPatternDb.prepare('SELECT COUNT(*) as count FROM gcp_query_patterns').get(),
        avgCost: this.gcpPatternDb.prepare('SELECT AVG(cost_usd) as avg FROM gcp_query_patterns WHERE cost_usd IS NOT NULL').get(),
      },
    };
    
    return stats;
  }

  close(): void {
    this.patternDb.close();
    this.gcpPatternDb.close();
  }
}

// CLI interface for generating test data
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const generator = new TestDataGenerator();
  
  const command = process.argv[2];
  
  switch (command) {
    case 'seed':
      await generator.seedTestData();
      console.log('Test data seeded successfully!');
      break;
    case 'scenario':
      const scenario = process.argv[3];
      if (scenario) {
        generator.generateScenarioData(scenario);
        console.log(`Scenario '${scenario}' data generated!`);
      } else {
        console.error('Please specify a scenario');
      }
      break;
    case 'stats':
      console.log('Test Data Statistics:');
      console.log(JSON.stringify(generator.getDataStats(), null, 2));
      break;
    default:
      console.log('Usage: node test-data-generator.js [seed|scenario|stats] [scenario_name]');
  }
  
  generator.close();
}

function fileURLToPath(url: string): string {
  return new URL(url).pathname;
}