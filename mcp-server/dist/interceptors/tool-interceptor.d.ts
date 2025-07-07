import { PatternPredictor, PredictionResult } from "../predictors/pattern-predictor.js";
import { PatternLearner } from "../learners/pattern-learner.js";
export interface ToolRequest {
    tool: string;
    params: any;
    context: ToolContext;
}
export interface ToolContext {
    recentTools?: ToolExecution[];
    projectType?: string;
    currentDirectory?: string;
    environment?: Record<string, string>;
}
export interface ToolExecution {
    tool: string;
    params: any;
    timestamp: Date;
    outcome: "success" | "failure";
    duration: number;
    error?: string;
}
export declare class ToolInterceptor {
    private predictor;
    private learner;
    private recentExecutions;
    private maxHistorySize;
    constructor(predictor: PatternPredictor, learner: PatternLearner);
    interceptToolRequest(tool: string, params: any, context?: ToolContext): Promise<PredictionResult>;
    recordOutcome(tool: string, params: any, outcome: "success" | "failure", duration: number, error?: string): Promise<void>;
    analyzeSequence(tools: string[]): Promise<any>;
    private findCommonSequences;
    private analyzeSequenceRisks;
    getRecentHistory(): ToolExecution[];
    clearHistory(): void;
}
//# sourceMappingURL=tool-interceptor.d.ts.map