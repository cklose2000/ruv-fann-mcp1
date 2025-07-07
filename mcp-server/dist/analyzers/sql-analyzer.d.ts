/**
 * SQL Query Analysis Results
 */
export interface SQLAnalysisResult {
    syntaxScore: number;
    syntaxErrors: string[];
    queryType: string;
    hasFrom: boolean;
    hasJoins: boolean;
    joinCount: number;
    hasWhere: boolean;
    hasGroupBy: boolean;
    hasOrderBy: boolean;
    hasLimit: boolean;
    tableCount: number;
    tableNames: string[];
    crossRegionTables: string[];
    costRisk: number;
    cartesianJoinRisk: boolean;
    fullTableScanRisk: boolean;
    permissionRisk: number;
    restrictedDatasets: string[];
    complexityScore: number;
    functionCount: number;
    subqueryCount: number;
    performanceRisk: number;
    estimatedScanGb: number;
}
/**
 * SQL Query Analyzer for BigQuery-specific pattern detection
 */
export declare class SQLAnalyzer {
    private readonly logger;
    private readonly syntaxPatterns;
    private readonly costPatterns;
    private readonly permissionPatterns;
    private readonly regionPatterns;
    /**
     * Analyze SQL query for BigQuery-specific patterns
     */
    analyzeQuery(query: string, params?: any): SQLAnalysisResult;
    private normalizeQuery;
    private calculateSyntaxScore;
    private detectSyntaxErrors;
    private extractQueryType;
    private hasClause;
    private countJoins;
    private countTables;
    private extractTableNames;
    private detectCrossRegionTables;
    private calculateCostRisk;
    private calculatePermissionRisk;
    private detectRestrictedDatasets;
    private calculateComplexityScore;
    private countFunctions;
    private countSubqueries;
    private calculatePerformanceRisk;
    private estimateDataScan;
    private getDefaultAnalysis;
}
//# sourceMappingURL=sql-analyzer.d.ts.map