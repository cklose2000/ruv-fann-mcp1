import Database from "better-sqlite3";
import winston from "winston";
import path from "path";
import { fileURLToPath } from "url";
import { ToolExecution, ToolContext } from "../interceptors/tool-interceptor.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const logger = winston.createLogger({
  level: "debug",
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});

export interface Pattern {
  id: string;
  tool: string;
  params: any;
  context: any;
  outcome: "success" | "failure";
  duration: number;
  timestamp: Date;
  error?: string;
}

export interface LearnedPattern {
  patternId: string;
  patternType: "sequence" | "failure" | "success" | "timing";
  patternData: any;
  confidence: number;
  occurrenceCount: number;
  lastSeen: Date;
}

export class PatternLearner {
  private db: Database.Database;
  private learningBatchSize = 10;
  private pendingExecutions: ToolExecution[] = [];

  constructor(dbPath?: string) {
    const defaultPath = path.join(__dirname, "../../data/patterns.db");
    this.db = new Database(dbPath || defaultPath);
  }

  async initialize(): Promise<void> {
    logger.info("Initializing pattern database...");

    // Create tables
    this.db.exec(`
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

    logger.info("Pattern database initialized");
  }

  async recordExecution(execution: ToolExecution): Promise<void> {
    try {
      // Generate unique ID
      const id = this.generateId(execution);

      // Insert into database
      const stmt = this.db.prepare(`
        INSERT INTO command_patterns 
        (id, tool, params, context, outcome, success, duration, error, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        execution.tool,
        JSON.stringify(execution.params),
        JSON.stringify(this.extractContext(execution)),
        execution.outcome,
        execution.outcome === "success" ? 1 : 0,
        execution.duration,
        execution.error || null,
        execution.timestamp.toISOString()
      );

      // Add to pending batch
      this.pendingExecutions.push(execution);

      // Trigger learning if batch is full
      if (this.pendingExecutions.length >= this.learningBatchSize) {
        await this.performBatchLearning();
      }
    } catch (error) {
      logger.error("Failed to record execution:", error);
    }
  }

  async findSimilarPatterns(
    tool: string,
    params: any,
    context: ToolContext,
    limit: number = 10
  ): Promise<Pattern[]> {
    try {
      // Find patterns with same tool and similar params
      const stmt = this.db.prepare(`
        SELECT * FROM command_patterns
        WHERE tool = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);

      const rows = stmt.all(tool, limit * 2); // Get more to filter

      // Filter by similarity
      const patterns = rows
        .map(row => ({
          id: row.id as string,
          tool: row.tool as string,
          params: JSON.parse(row.params as string),
          context: row.context ? JSON.parse(row.context as string) : {},
          outcome: row.outcome as "success" | "failure",
          duration: row.duration as number,
          timestamp: new Date(row.timestamp as string),
          error: row.error as string | undefined,
        }))
        .filter(pattern => this.isSimilar(params, pattern.params))
        .slice(0, limit);

      return patterns;
    } catch (error) {
      logger.error("Failed to find similar patterns:", error);
      return [];
    }
  }

  private async performBatchLearning(): Promise<void> {
    if (this.pendingExecutions.length === 0) return;

    logger.debug(`Performing batch learning on ${this.pendingExecutions.length} executions`);

    try {
      // Learn sequence patterns
      await this.learnSequencePatterns(this.pendingExecutions);

      // Learn failure patterns
      await this.learnFailurePatterns(this.pendingExecutions);

      // Learn timing patterns
      await this.learnTimingPatterns(this.pendingExecutions);

      // Clear pending batch
      this.pendingExecutions = [];
    } catch (error) {
      logger.error("Batch learning failed:", error);
    }
  }

  private async learnSequencePatterns(executions: ToolExecution[]): Promise<void> {
    // Look for common tool sequences
    const sequences = new Map<string, number>();

    for (let i = 0; i < executions.length - 1; i++) {
      const sequence = `${executions[i].tool} -> ${executions[i + 1].tool}`;
      sequences.set(sequence, (sequences.get(sequence) || 0) + 1);
    }

    // Store significant sequences
    for (const [sequence, count] of sequences.entries()) {
      if (count >= 2) {
        await this.upsertLearnedPattern({
          patternId: `seq_${this.hashString(sequence)}`,
          patternType: "sequence",
          patternData: { sequence, tools: sequence.split(" -> ") },
          confidence: count / executions.length,
          occurrenceCount: count,
          lastSeen: new Date(),
        });
      }
    }
  }

  private async learnFailurePatterns(executions: ToolExecution[]): Promise<void> {
    // Group failures by tool and params
    const failures = executions.filter(e => e.outcome === "failure");
    const failureGroups = new Map<string, ToolExecution[]>();

    for (const failure of failures) {
      const key = `${failure.tool}:${JSON.stringify(failure.params)}`;
      const group = failureGroups.get(key) || [];
      group.push(failure);
      failureGroups.set(key, group);
    }

    // Store patterns for repeated failures
    for (const [key, group] of failureGroups.entries()) {
      if (group.length >= 2) {
        const [tool] = key.split(":");
        const commonError = this.findCommonError(group);

        await this.upsertLearnedPattern({
          patternId: `fail_${this.hashString(key)}`,
          patternType: "failure",
          patternData: {
            tool,
            failureCount: group.length,
            commonError,
            lastError: group[group.length - 1].error,
          },
          confidence: group.length / executions.filter(e => e.tool === tool).length,
          occurrenceCount: group.length,
          lastSeen: new Date(),
        });
      }
    }
  }

  private async learnTimingPatterns(executions: ToolExecution[]): Promise<void> {
    // Group by tool to learn timing patterns
    const timingGroups = new Map<string, number[]>();

    for (const execution of executions) {
      if (execution.duration) {
        const durations = timingGroups.get(execution.tool) || [];
        durations.push(execution.duration);
        timingGroups.set(execution.tool, durations);
      }
    }

    // Calculate statistics and store patterns
    for (const [tool, durations] of timingGroups.entries()) {
      if (durations.length >= 3) {
        const stats = this.calculateStats(durations);

        await this.upsertLearnedPattern({
          patternId: `time_${tool}`,
          patternType: "timing",
          patternData: {
            tool,
            avgDuration: stats.mean,
            medianDuration: stats.median,
            stdDev: stats.stdDev,
            samples: durations.length,
          },
          confidence: Math.min(durations.length / 10, 0.9),
          occurrenceCount: durations.length,
          lastSeen: new Date(),
        });
      }
    }
  }

  private async upsertLearnedPattern(pattern: LearnedPattern): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO learned_patterns 
      (pattern_id, pattern_type, pattern_data, confidence, occurrence_count, last_seen)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(pattern_id) DO UPDATE SET
        pattern_data = excluded.pattern_data,
        confidence = excluded.confidence,
        occurrence_count = occurrence_count + excluded.occurrence_count,
        last_seen = excluded.last_seen
    `);

    stmt.run(
      pattern.patternId,
      pattern.patternType,
      JSON.stringify(pattern.patternData),
      pattern.confidence,
      pattern.occurrenceCount,
      pattern.lastSeen.toISOString()
    );
  }

  async getPatterns(type?: string): Promise<LearnedPattern[]> {
    const query = type
      ? "SELECT * FROM learned_patterns WHERE pattern_type = ? ORDER BY confidence DESC"
      : "SELECT * FROM learned_patterns ORDER BY confidence DESC";

    const stmt = this.db.prepare(query);
    const rows = type ? stmt.all(type) : stmt.all();

    return rows.map(row => ({
      patternId: row.pattern_id as string,
      patternType: row.pattern_type as string,
      patternData: JSON.parse(row.pattern_data as string),
      confidence: row.confidence as number,
      occurrenceCount: row.occurrence_count as number,
      lastSeen: new Date(row.last_seen as string),
    }));
  }

  async getStatistics(): Promise<any> {
    const stats = {
      totalExecutions: this.db.prepare("SELECT COUNT(*) as count FROM command_patterns").get(),
      successRate: this.db.prepare("SELECT AVG(success) as rate FROM command_patterns").get(),
      learnedPatterns: this.db.prepare("SELECT COUNT(*) as count FROM learned_patterns").get(),
      patternTypes: this.db.prepare(
        "SELECT pattern_type, COUNT(*) as count FROM learned_patterns GROUP BY pattern_type"
      ).all(),
    };

    return stats;
  }

  private generateId(execution: ToolExecution): string {
    const content = `${execution.tool}:${JSON.stringify(execution.params)}:${execution.timestamp.getTime()}`;
    return this.hashString(content);
  }

  private hashString(str: string): string {
    // Simple hash for demo - should use proper crypto hash in production
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  private extractContext(execution: ToolExecution): any {
    // Extract relevant context features
    return {
      hour: execution.timestamp.getHours(),
      dayOfWeek: execution.timestamp.getDay(),
      // Add more context as needed
    };
  }

  private isSimilar(params1: any, params2: any): boolean {
    // Simple similarity check - could be more sophisticated
    const keys1 = Object.keys(params1 || {}).sort();
    const keys2 = Object.keys(params2 || {}).sort();

    // Same keys is a good start
    if (keys1.join(",") !== keys2.join(",")) {
      return false;
    }

    // Check value similarity for string params
    let matches = 0;
    for (const key of keys1) {
      if (params1[key] === params2[key]) {
        matches++;
      }
    }

    return matches / keys1.length > 0.7; // 70% similarity threshold
  }

  private findCommonError(executions: ToolExecution[]): string | null {
    const errors = executions
      .filter(e => e.error)
      .map(e => e.error!);

    if (errors.length === 0) return null;

    // Find most common error substring
    const errorCounts = new Map<string, number>();
    for (const error of errors) {
      // Extract key parts of error
      const keyParts = error.match(/\b\w+Error\b|\b\w+Exception\b/g) || [];
      for (const part of keyParts) {
        errorCounts.set(part, (errorCounts.get(part) || 0) + 1);
      }
    }

    // Return most common
    let maxCount = 0;
    let commonError = errors[0].substring(0, 50); // Default to first error
    
    for (const [error, count] of errorCounts.entries()) {
      if (count > maxCount) {
        maxCount = count;
        commonError = error;
      }
    }

    return commonError;
  }

  private calculateStats(values: number[]): any {
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const median = sorted[Math.floor(sorted.length / 2)];
    
    const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return { mean, median, stdDev };
  }

  close(): void {
    this.db.close();
  }
}