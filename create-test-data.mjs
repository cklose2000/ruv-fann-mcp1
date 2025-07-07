#!/usr/bin/env node

/**
 * Test Data Creation for ruv-FANN MCP System
 * Agent A - Database Test Data Population
 */

// Dynamic import for better-sqlite3 with fallback
let Database;
try {
  Database = (await import('/home/cklose/ruv-fann-mcp1/mcp-server/node_modules/better-sqlite3/lib/index.js')).default;
} catch (error) {
  console.error('Could not load better-sqlite3:', error.message);
  process.exit(1);
}
import { existsSync } from 'fs';

console.log('=== Creating Test Data for ruv-FANN MCP System ===\n');

try {
  // Open patterns database
  const patternsDbPath = '/home/cklose/ruv-fann-mcp1/mcp-server/data/patterns.db';
  
  if (!existsSync(patternsDbPath)) {
    console.error('✗ patterns.db not found at:', patternsDbPath);
    process.exit(1);
  }
  
  const db = new Database(patternsDbPath);
  
  // Initialize tables if they don't exist
  console.log('Initializing database tables...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS command_patterns (
      id TEXT PRIMARY KEY,
      tool TEXT NOT NULL,
      params TEXT NOT NULL,
      context TEXT,
      outcome TEXT NOT NULL,
      success BOOLEAN NOT NULL,
      duration INTEGER,
      error TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS learned_patterns (
      pattern_id TEXT PRIMARY KEY,
      pattern_type TEXT NOT NULL,
      pattern_data TEXT NOT NULL,
      confidence REAL DEFAULT 0.5,
      occurrence_count INTEGER DEFAULT 1,
      last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tool ON command_patterns(tool);
    CREATE INDEX IF NOT EXISTS idx_outcome ON command_patterns(outcome);
    CREATE INDEX IF NOT EXISTS idx_timestamp ON command_patterns(timestamp);
    CREATE INDEX IF NOT EXISTS idx_pattern_type ON learned_patterns(pattern_type);
  `);
  
  console.log('✓ Database tables and indexes created/verified');
  
  // Create comprehensive test data
  console.log('\nCreating test command patterns...');
  
  const testPatterns = [
    // BigQuery patterns
    {
      tool: 'bq',
      params: JSON.stringify({ 
        query: 'SELECT COUNT(*) FROM dataset.table', 
        use_legacy_sql: false 
      }),
      context: JSON.stringify({ 
        projectType: 'analytics',
        tableSize: 'small'
      }),
      outcome: 'success',
      duration: 1250,
      error: null
    },
    {
      tool: 'bq',
      params: JSON.stringify({ 
        query: 'SELECT * FROM huge_table LIMIT 1000000', 
        use_legacy_sql: false 
      }),
      context: JSON.stringify({ 
        projectType: 'analytics',
        tableSize: 'large'
      }),
      outcome: 'failure',
      duration: 30000,
      error: 'Query exceeded resource limits'
    },
    {
      tool: 'bq',
      params: JSON.stringify({ 
        query: 'SELECT user_id, COUNT(*) as actions FROM user_events GROUP BY user_id', 
        use_legacy_sql: false 
      }),
      context: JSON.stringify({ 
        projectType: 'analytics',
        tableSize: 'medium'
      }),
      outcome: 'success',
      duration: 5200,
      error: null
    },
    
    // Git patterns
    {
      tool: 'git',
      params: JSON.stringify({ 
        command: 'push', 
        branch: 'main',
        force: false
      }),
      context: JSON.stringify({ 
        hasChanges: true,
        branchStatus: 'ahead'
      }),
      outcome: 'success',
      duration: 2100,
      error: null
    },
    {
      tool: 'git',
      params: JSON.stringify({ 
        command: 'push', 
        branch: 'main',
        force: false
      }),
      context: JSON.stringify({ 
        hasChanges: true,
        branchStatus: 'behind'
      }),
      outcome: 'failure',
      duration: 1800,
      error: 'Updates were rejected because the remote contains work that you do not have locally'
    },
    {
      tool: 'git',
      params: JSON.stringify({ 
        command: 'merge', 
        branch: 'feature/new-feature'
      }),
      context: JSON.stringify({ 
        conflicts: true
      }),
      outcome: 'failure',
      duration: 800,
      error: 'Automatic merge failed; fix conflicts and then commit the result'
    },
    
    // Bash patterns
    {
      tool: 'bash',
      params: JSON.stringify({ 
        command: 'ls -la /home/user/documents'
      }),
      context: JSON.stringify({ 
        directory: '/home/user/documents',
        permissions: 'read'
      }),
      outcome: 'success',
      duration: 50,
      error: null
    },
    {
      tool: 'bash',
      params: JSON.stringify({ 
        command: 'rm -rf /protected/system/files'
      }),
      context: JSON.stringify({ 
        directory: '/protected/system/files',
        permissions: 'restricted'
      }),
      outcome: 'failure',
      duration: 100,
      error: 'Permission denied'
    },
    {
      tool: 'bash',
      params: JSON.stringify({ 
        command: 'find /var/log -name "*.log" -size +100M'
      }),
      context: JSON.stringify({ 
        directory: '/var/log',
        searchType: 'file'
      }),
      outcome: 'success',
      duration: 2500,
      error: null
    },
    
    // File operation patterns
    {
      tool: 'file',
      params: JSON.stringify({ 
        operation: 'read', 
        path: '/tmp/test.txt' 
      }),
      context: JSON.stringify({ 
        fileSize: 1024,
        permissions: 'readable'
      }),
      outcome: 'success',
      duration: 25,
      error: null
    },
    {
      tool: 'file',
      params: JSON.stringify({ 
        operation: 'write', 
        path: '/readonly/config.conf' 
      }),
      context: JSON.stringify({ 
        fileSize: 2048,
        permissions: 'readonly'
      }),
      outcome: 'failure',
      duration: 15,
      error: 'Read-only file system'
    },
    {
      tool: 'file',
      params: JSON.stringify({ 
        operation: 'delete', 
        path: '/important/data.db' 
      }),
      context: JSON.stringify({ 
        fileSize: 50000,
        permissions: 'protected'
      }),
      outcome: 'failure',
      duration: 5,
      error: 'Operation not permitted'
    },
    
    // Database patterns
    {
      tool: 'sql',
      params: JSON.stringify({ 
        query: 'SELECT * FROM users WHERE active = true LIMIT 10' 
      }),
      context: JSON.stringify({ 
        dbType: 'postgresql',
        tableSize: 'large'
      }),
      outcome: 'success',
      duration: 340,
      error: null
    },
    {
      tool: 'sql',
      params: JSON.stringify({ 
        query: 'DELETE FROM users WHERE last_login < NOW() - INTERVAL 1 YEAR' 
      }),
      context: JSON.stringify({ 
        dbType: 'postgresql',
        tableSize: 'large'
      }),
      outcome: 'failure',
      duration: 120,
      error: 'Foreign key constraint violation'
    },
    {
      tool: 'sql',
      params: JSON.stringify({ 
        query: 'SELECT COUNT(*) FROM orders WHERE status = pending' 
      }),
      context: JSON.stringify({ 
        dbType: 'mysql',
        tableSize: 'medium'
      }),
      outcome: 'success',
      duration: 180,
      error: null
    }
  ];
  
  // Insert test patterns
  const insertStmt = db.prepare(`
    INSERT INTO command_patterns 
    (id, tool, params, context, outcome, success, duration, error, timestamp)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  
  let insertedCount = 0;
  for (const pattern of testPatterns) {
    const id = `test_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      insertStmt.run(
        id,
        pattern.tool,
        pattern.params,
        pattern.context,
        pattern.outcome,
        pattern.outcome === 'success' ? 1 : 0,
        pattern.duration,
        pattern.error,
        new Date().toISOString()
      );
      insertedCount++;
    } catch (error) {
      console.error(`Failed to insert pattern ${id}:`, error.message);
    }
  }
  
  console.log(`✓ Created ${insertedCount} command patterns`);
  
  // Create learned patterns
  console.log('Creating learned patterns...');
  
  const learnedPatterns = [
    {
      pattern_id: 'seq_git_workflow',
      pattern_type: 'sequence',
      pattern_data: JSON.stringify({
        sequence: 'git add -> git commit -> git push',
        tools: ['git', 'git', 'git'],
        successRate: 0.85,
        avgDuration: 4200,
        commonContext: { hasChanges: true }
      }),
      confidence: 0.85,
      occurrence_count: 18
    },
    {
      pattern_id: 'fail_bq_large_queries',
      pattern_type: 'failure',
      pattern_data: JSON.stringify({
        tool: 'bq',
        failureCount: 12,
        commonError: 'Query exceeded resource limits',
        recommendation: 'Add LIMIT clause or use sampling',
        avgFailureDuration: 28000,
        successfulAlternative: 'Use SELECT * FROM table LIMIT 1000'
      }),
      confidence: 0.92,
      occurrence_count: 12
    },
    {
      pattern_id: 'time_sql_queries',
      pattern_type: 'timing',
      pattern_data: JSON.stringify({
        tool: 'sql',
        avgDuration: 285,
        medianDuration: 250,
        stdDev: 120,
        samples: 15,
        slowQueryThreshold: 500,
        recommendedOptimization: 'Add indexes on frequently queried columns'
      }),
      confidence: 0.78,
      occurrence_count: 15
    },
    {
      pattern_id: 'success_file_operations',
      pattern_type: 'success',
      pattern_data: JSON.stringify({
        tool: 'file',
        successRate: 0.75,
        avgDuration: 45,
        commonSuccessContext: { permissions: 'readable' },
        bestPractices: ['Check permissions first', 'Use absolute paths']
      }),
      confidence: 0.75,
      occurrence_count: 8
    },
    {
      pattern_id: 'fail_permission_errors',
      pattern_type: 'failure',
      pattern_data: JSON.stringify({
        tools: ['bash', 'file'],
        commonError: 'Permission denied',
        failureCount: 6,
        recommendation: 'Check file permissions with ls -la before operations',
        preventionStrategy: 'Use sudo for system operations'
      }),
      confidence: 0.88,
      occurrence_count: 6
    }
  ];
  
  const learnedStmt = db.prepare(`
    INSERT INTO learned_patterns 
    (pattern_id, pattern_type, pattern_data, confidence, occurrence_count, last_seen)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  
  let learnedCount = 0;
  for (const pattern of learnedPatterns) {
    try {
      learnedStmt.run(
        pattern.pattern_id,
        pattern.pattern_type,
        pattern.pattern_data,
        pattern.confidence,
        pattern.occurrence_count,
        new Date().toISOString()
      );
      learnedCount++;
    } catch (error) {
      console.error(`Failed to insert learned pattern ${pattern.pattern_id}:`, error.message);
    }
  }
  
  console.log(`✓ Created ${learnedCount} learned patterns`);
  
  // Verify the data
  console.log('\nVerifying test data...');
  
  const finalCommandCount = db.prepare("SELECT COUNT(*) as count FROM command_patterns").get();
  const finalLearnedCount = db.prepare("SELECT COUNT(*) as count FROM learned_patterns").get();
  
  console.log(`✓ Total command patterns: ${finalCommandCount.count}`);
  console.log(`✓ Total learned patterns: ${finalLearnedCount.count}`);
  
  // Test queries
  console.log('\nTesting pattern queries...');
  
  const toolDistribution = db.prepare(`
    SELECT tool, COUNT(*) as count, 
           SUM(success) as successes,
           AVG(duration) as avg_duration
    FROM command_patterns 
    GROUP BY tool
  `).all();
  
  console.log('Tool distribution:');
  toolDistribution.forEach(row => {
    const successRate = (row.successes / row.count * 100).toFixed(1);
    console.log(`  ${row.tool}: ${row.count} patterns, ${successRate}% success, ${Math.round(row.avg_duration)}ms avg`);
  });
  
  const patternTypes = db.prepare(`
    SELECT pattern_type, COUNT(*) as count, AVG(confidence) as avg_confidence
    FROM learned_patterns 
    GROUP BY pattern_type
  `).all();
  
  console.log('\nLearned pattern types:');
  patternTypes.forEach(row => {
    console.log(`  ${row.pattern_type}: ${row.count} patterns, ${(row.avg_confidence * 100).toFixed(1)}% confidence`);
  });
  
  // Test performance
  console.log('\nTesting query performance...');
  
  const queries = [
    { name: 'Find recent patterns', sql: 'SELECT * FROM command_patterns ORDER BY timestamp DESC LIMIT 5' },
    { name: 'Get failures by tool', sql: 'SELECT tool, COUNT(*) FROM command_patterns WHERE success = 0 GROUP BY tool' },
    { name: 'Get high-confidence patterns', sql: 'SELECT * FROM learned_patterns WHERE confidence > 0.8' },
    { name: 'Search by tool', sql: 'SELECT * FROM command_patterns WHERE tool = ? LIMIT 3' }
  ];
  
  for (const query of queries) {
    const start = Date.now();
    
    if (query.sql.includes('?')) {
      const stmt = db.prepare(query.sql);
      stmt.all('git');
    } else {
      const stmt = db.prepare(query.sql);
      stmt.all();
    }
    
    const duration = Date.now() - start;
    console.log(`  ${query.name}: ${duration}ms`);
  }
  
  db.close();
  
  console.log('\n✓ Test data creation completed successfully!');
  console.log('\nSUMMARY:');
  console.log(`  - Command patterns: ${finalCommandCount.count}`);
  console.log(`  - Learned patterns: ${finalLearnedCount.count}`);
  console.log(`  - Tools covered: BigQuery, Git, Bash, File operations, SQL`);
  console.log(`  - Pattern types: sequence, failure, timing, success`);
  console.log(`  - Database ready for testing and validation`);
  
} catch (error) {
  console.error('✗ Test data creation failed:', error);
  process.exit(1);
}