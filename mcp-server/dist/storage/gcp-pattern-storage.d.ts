export interface GCPCommandPattern {
    id?: number;
    tool: string;
    params: string;
    context: string;
    outcome: 'success' | 'failure';
    duration: number;
    error?: string;
    timestamp: Date;
    cost_estimate?: number;
    rows_processed?: number;
    auth_token_age?: number;
}
export interface GCPQueryPattern {
    id?: number;
    query_type: string;
    table_size_gb?: number;
    execution_time_ms: number;
    cost_usd?: number;
    rows_returned: number;
    success: boolean;
    error_type?: string;
    timestamp: Date;
}
export interface GCPAuthPattern {
    id?: number;
    token_age_minutes: number;
    operation_type: string;
    success: boolean;
    error_message?: string;
    timestamp: Date;
}
export interface GCPQuotaPattern {
    id?: number;
    resource_type: string;
    usage_level: number;
    operation_type: string;
    success: boolean;
    timestamp: Date;
}
export interface GCPUserPattern {
    id?: number;
    user_id: string;
    common_projects: string;
    frequent_datasets: string;
    typical_operations: string;
    error_patterns: string;
    last_updated: Date;
}
export declare class GCPPatternStorage {
    private db;
    private logger;
    constructor(dbPath?: string);
    private initializeTables;
    recordCommandPattern(pattern: Omit<GCPCommandPattern, 'id' | 'timestamp'>): Promise<number>;
    getSimilarCommands(tool: string, params: any, limit?: number): Promise<GCPCommandPattern[]>;
    getSuccessfulPatterns(tool: string, limit?: number): Promise<GCPCommandPattern[]>;
    recordQueryPattern(pattern: Omit<GCPQueryPattern, 'id' | 'timestamp'>): Promise<number>;
    predictQueryCost(queryType: string, tableSizeGb?: number): Promise<{
        avgCost: number;
        confidence: number;
    }>;
    recordAuthPattern(pattern: Omit<GCPAuthPattern, 'id' | 'timestamp'>): Promise<number>;
    predictAuthFailure(tokenAgeMinutes: number): Promise<{
        failureProbability: number;
        confidence: number;
    }>;
    updateUserPatterns(userId: string, updates: Partial<GCPUserPattern>): Promise<void>;
    getUserPatterns(userId: string): Promise<GCPUserPattern | null>;
    getPatternStatistics(): Promise<any>;
    cleanupOldPatterns(daysToKeep?: number): Promise<number>;
    getAverageQueryDuration(queryType: string): Promise<number>;
    getQuerySuccessRate(queryType: string): Promise<number>;
    getAuthFailureRate(tokenAgeMinutes: number): Promise<number>;
    close(): void;
}
//# sourceMappingURL=gcp-pattern-storage.d.ts.map