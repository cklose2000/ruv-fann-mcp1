import { ToolExecution, ToolContext } from "../interceptors/tool-interceptor.js";
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
export declare class PatternLearner {
    private db;
    private learningBatchSize;
    private pendingExecutions;
    constructor(dbPath?: string);
    initialize(): Promise<void>;
    recordExecution(execution: ToolExecution): Promise<void>;
    findSimilarPatterns(tool: string, params: any, context: ToolContext, limit?: number): Promise<Pattern[]>;
    private performBatchLearning;
    private learnSequencePatterns;
    private learnFailurePatterns;
    private learnTimingPatterns;
    private upsertLearnedPattern;
    getPatterns(type?: string): Promise<LearnedPattern[]>;
    getStatistics(): Promise<any>;
    private generateId;
    private hashString;
    private extractContext;
    private isSimilar;
    private findCommonError;
    private calculateStats;
    close(): void;
}
//# sourceMappingURL=pattern-learner.d.ts.map