import winston from 'winston';

const logger = winston.createLogger({
  level: 'debug',
  format: winston.format.simple(),
  transports: [new winston.transports.Console()],
});

/**
 * SQL Query Analysis Results
 */
export interface SQLAnalysisResult {
  // Syntax validation
  syntaxScore: number;          // 0-1 (1 = likely valid syntax)
  syntaxErrors: string[];       // Detected syntax issues
  
  // Query structure
  queryType: string;            // SELECT, INSERT, UPDATE, DELETE, etc.
  hasFrom: boolean;             // Has FROM clause
  hasJoins: boolean;            // Has JOIN operations
  joinCount: number;            // Number of joins
  hasWhere: boolean;            // Has WHERE clause
  hasGroupBy: boolean;          // Has GROUP BY
  hasOrderBy: boolean;          // Has ORDER BY
  hasLimit: boolean;            // Has LIMIT clause
  
  // Table analysis
  tableCount: number;           // Number of tables referenced
  tableNames: string[];         // List of table names
  crossRegionTables: string[];  // Tables from different regions
  
  // Cost indicators
  costRisk: number;             // 0-1 (1 = high cost risk)
  cartesianJoinRisk: boolean;   // Potential cartesian product
  fullTableScanRisk: boolean;   // Likely full table scan
  
  // Permission indicators
  permissionRisk: number;       // 0-1 (1 = high permission risk)
  restrictedDatasets: string[]; // Datasets that might be restricted
  
  // Complexity metrics
  complexityScore: number;      // 0-1 (1 = very complex)
  functionCount: number;        // Number of functions used
  subqueryCount: number;        // Number of subqueries
  
  // Performance indicators
  performanceRisk: number;      // 0-1 (1 = high performance risk)
  estimatedScanGb: number;      // Estimated data scan size
}

/**
 * SQL Query Analyzer for BigQuery-specific pattern detection
 */
export class SQLAnalyzer {
  private readonly logger = logger.child({ component: 'SQLAnalyzer' });
  
  // BigQuery-specific patterns
  private readonly syntaxPatterns = {
    missingFrom: /SELECT\s+[^;]+(?!FROM)/i,
    invalidJoin: /JOIN\s+ON\s+[^=]+(?!=)/i,
    missingSelect: /FROM\s+\w+\s+WHERE/i,
    invalidFunction: /\b(INVALID_FUNC|UNKNOWN_FUNC)\b/i,
    invalidColumn: /\b(non_existent_column|invalid_column)\b/i,
  };
  
  private readonly costPatterns = {
    fullTableScan: /SELECT\s+\*\s+FROM\s+\w+\s*(?!WHERE)/i,
    cartesianJoin: /FROM\s+\w+\s*,\s*\w+/i,
    largeTable: /billion_row_table|massive_table|huge_table/i,
    crossJoin: /CROSS\s+JOIN/i,
    noLimit: /SELECT\s+[^;]+(?!LIMIT)/i,
  };
  
  private readonly permissionPatterns = {
    restrictedDataset: /restricted_dataset|private_dataset|internal_dataset/i,
    systemTable: /INFORMATION_SCHEMA|__TABLES__|__PARTITIONS__/i,
    adminFunction: /ADMIN\.|SYSTEM\./i,
  };
  
  private readonly regionPatterns = {
    usRegion: /us-central1|us-east1|us-west1/i,
    euRegion: /eu-west1|eu-central1|europe-west1/i,
    asiaRegion: /asia-northeast1|asia-south1|asia-east1/i,
  };

  /**
   * Analyze SQL query for BigQuery-specific patterns
   */
  public analyzeQuery(query: string, params?: any): SQLAnalysisResult {
    this.logger.debug('Analyzing SQL query', { queryLength: query.length });
    
    try {
      const normalizedQuery = this.normalizeQuery(query);
      
      const result: SQLAnalysisResult = {
        // Syntax analysis
        syntaxScore: this.calculateSyntaxScore(normalizedQuery),
        syntaxErrors: this.detectSyntaxErrors(normalizedQuery),
        
        // Query structure
        queryType: this.extractQueryType(normalizedQuery),
        hasFrom: this.hasClause(normalizedQuery, 'FROM'),
        hasJoins: this.hasClause(normalizedQuery, 'JOIN'),
        joinCount: this.countJoins(normalizedQuery),
        hasWhere: this.hasClause(normalizedQuery, 'WHERE'),
        hasGroupBy: this.hasClause(normalizedQuery, 'GROUP BY'),
        hasOrderBy: this.hasClause(normalizedQuery, 'ORDER BY'),
        hasLimit: this.hasClause(normalizedQuery, 'LIMIT'),
        
        // Table analysis
        tableCount: this.countTables(normalizedQuery),
        tableNames: this.extractTableNames(normalizedQuery),
        crossRegionTables: this.detectCrossRegionTables(normalizedQuery),
        
        // Cost indicators
        costRisk: this.calculateCostRisk(normalizedQuery),
        cartesianJoinRisk: this.costPatterns.cartesianJoin.test(normalizedQuery),
        fullTableScanRisk: this.costPatterns.fullTableScan.test(normalizedQuery),
        
        // Permission indicators
        permissionRisk: this.calculatePermissionRisk(normalizedQuery),
        restrictedDatasets: this.detectRestrictedDatasets(normalizedQuery),
        
        // Complexity metrics
        complexityScore: this.calculateComplexityScore(normalizedQuery),
        functionCount: this.countFunctions(normalizedQuery),
        subqueryCount: this.countSubqueries(normalizedQuery),
        
        // Performance indicators
        performanceRisk: this.calculatePerformanceRisk(normalizedQuery),
        estimatedScanGb: this.estimateDataScan(normalizedQuery, params),
      };
      
      this.logger.debug('SQL analysis complete', { 
        syntaxScore: result.syntaxScore,
        costRisk: result.costRisk,
        complexityScore: result.complexityScore
      });
      
      return result;
      
    } catch (error: any) {
      this.logger.error('SQL analysis failed', { error: error.message });
      return this.getDefaultAnalysis();
    }
  }

  private normalizeQuery(query: string): string {
    return query
      .replace(/\s+/g, ' ')
      .trim()
      .toUpperCase();
  }

  private calculateSyntaxScore(query: string): number {
    let score = 1.0;
    
    // Check for basic syntax requirements
    if (this.syntaxPatterns.missingFrom.test(query)) score -= 0.3;
    if (this.syntaxPatterns.invalidJoin.test(query)) score -= 0.2;
    if (this.syntaxPatterns.missingSelect.test(query)) score -= 0.4;
    if (this.syntaxPatterns.invalidFunction.test(query)) score -= 0.2;
    if (this.syntaxPatterns.invalidColumn.test(query)) score -= 0.2;
    
    // Check for balanced parentheses
    const openParens = (query.match(/\(/g) || []).length;
    const closeParens = (query.match(/\)/g) || []).length;
    if (openParens !== closeParens) score -= 0.1;
    
    return Math.max(0, score);
  }

  private detectSyntaxErrors(query: string): string[] {
    const errors: string[] = [];
    
    if (this.syntaxPatterns.missingFrom.test(query)) {
      errors.push('Expected keyword FROM');
    }
    if (this.syntaxPatterns.invalidJoin.test(query)) {
      errors.push('Expected table name after JOIN');
    }
    if (this.syntaxPatterns.invalidColumn.test(query)) {
      errors.push('Column not found');
    }
    
    return errors;
  }

  private extractQueryType(query: string): string {
    const match = query.match(/^(SELECT|INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)\b/i);
    return match ? match[1].toUpperCase() : 'UNKNOWN';
  }

  private hasClause(query: string, clause: string): boolean {
    return new RegExp(`\\b${clause}\\b`, 'i').test(query);
  }

  private countJoins(query: string): number {
    const matches = query.match(/\bJOIN\b/gi);
    return matches ? matches.length : 0;
  }

  private countTables(query: string): number {
    const tableNames = this.extractTableNames(query);
    return tableNames.length;
  }

  private extractTableNames(query: string): string[] {
    const tables: string[] = [];
    
    // Match table names after FROM and JOIN
    const fromMatches = query.match(/FROM\s+([`\w.-]+)/gi);
    const joinMatches = query.match(/JOIN\s+([`\w.-]+)/gi);
    
    if (fromMatches) {
      fromMatches.forEach(match => {
        const table = match.replace(/FROM\s+/i, '').replace(/`/g, '');
        tables.push(table);
      });
    }
    
    if (joinMatches) {
      joinMatches.forEach(match => {
        const table = match.replace(/JOIN\s+/i, '').replace(/`/g, '');
        tables.push(table);
      });
    }
    
    return [...new Set(tables)]; // Remove duplicates
  }

  private detectCrossRegionTables(query: string): string[] {
    const tables = this.extractTableNames(query);
    const regions = new Set<string>();
    
    tables.forEach(table => {
      if (this.regionPatterns.usRegion.test(table)) regions.add('us');
      if (this.regionPatterns.euRegion.test(table)) regions.add('eu');
      if (this.regionPatterns.asiaRegion.test(table)) regions.add('asia');
    });
    
    return regions.size > 1 ? tables.filter(table => 
      this.regionPatterns.usRegion.test(table) || 
      this.regionPatterns.euRegion.test(table) || 
      this.regionPatterns.asiaRegion.test(table)
    ) : [];
  }

  private calculateCostRisk(query: string): number {
    let risk = 0;
    
    if (this.costPatterns.fullTableScan.test(query)) risk += 0.4;
    if (this.costPatterns.cartesianJoin.test(query)) risk += 0.3;
    if (this.costPatterns.largeTable.test(query)) risk += 0.3;
    if (this.costPatterns.crossJoin.test(query)) risk += 0.2;
    if (this.costPatterns.noLimit.test(query)) risk += 0.1;
    
    return Math.min(1, risk);
  }

  private calculatePermissionRisk(query: string): number {
    let risk = 0;
    
    if (this.permissionPatterns.restrictedDataset.test(query)) risk += 0.5;
    if (this.permissionPatterns.systemTable.test(query)) risk += 0.3;
    if (this.permissionPatterns.adminFunction.test(query)) risk += 0.2;
    
    return Math.min(1, risk);
  }

  private detectRestrictedDatasets(query: string): string[] {
    const datasets: string[] = [];
    
    if (this.permissionPatterns.restrictedDataset.test(query)) {
      datasets.push('restricted_dataset');
    }
    
    return datasets;
  }

  private calculateComplexityScore(query: string): number {
    let score = 0;
    
    // Base complexity from length
    score += Math.min(0.2, query.length / 1000);
    
    // Add complexity for operations
    score += this.countJoins(query) * 0.1;
    score += this.countSubqueries(query) * 0.15;
    score += this.countFunctions(query) * 0.05;
    
    return Math.min(1, score);
  }

  private countFunctions(query: string): number {
    const functions = query.match(/\b\w+\(/g);
    return functions ? functions.length : 0;
  }

  private countSubqueries(query: string): number {
    // Count SELECT statements after the first one
    const selects = query.match(/SELECT/gi);
    return selects ? selects.length - 1 : 0;
  }

  private calculatePerformanceRisk(query: string): number {
    let risk = 0;
    
    risk += this.calculateCostRisk(query) * 0.5;
    risk += this.calculateComplexityScore(query) * 0.3;
    risk += (this.countJoins(query) > 3 ? 0.2 : 0);
    
    return Math.min(1, risk);
  }

  private estimateDataScan(query: string, params?: any): number {
    // Simple estimation based on patterns
    let scanGb = 0.1; // Base scan
    
    if (this.costPatterns.fullTableScan.test(query)) scanGb *= 10;
    if (this.costPatterns.largeTable.test(query)) scanGb *= 100;
    if (this.costPatterns.cartesianJoin.test(query)) scanGb *= 50;
    
    return scanGb;
  }

  private getDefaultAnalysis(): SQLAnalysisResult {
    return {
      syntaxScore: 0.5,
      syntaxErrors: [],
      queryType: 'UNKNOWN',
      hasFrom: false,
      hasJoins: false,
      joinCount: 0,
      hasWhere: false,
      hasGroupBy: false,
      hasOrderBy: false,
      hasLimit: false,
      tableCount: 0,
      tableNames: [],
      crossRegionTables: [],
      costRisk: 0.5,
      cartesianJoinRisk: false,
      fullTableScanRisk: false,
      permissionRisk: 0.5,
      restrictedDatasets: [],
      complexityScore: 0.5,
      functionCount: 0,
      subqueryCount: 0,
      performanceRisk: 0.5,
      estimatedScanGb: 1.0,
    };
  }
}