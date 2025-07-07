import { RuvFannClient } from "../clients/ruv-fann-client.js";
import { PatternLearner } from "../learners/pattern-learner.js";
import { ToolContext } from "../interceptors/tool-interceptor.js";
export interface PredictionResult {
    successProbability: number;
    confidence: number;
    predictedDuration?: number;
    warnings?: Warning[];
    suggestions?: Suggestion[];
    explanation: string;
    patterns?: MatchedPattern[];
}
export interface Warning {
    level: "low" | "medium" | "high";
    message: string;
    suggestion?: Suggestion;
}
export interface Suggestion {
    tool: string;
    params: any;
    rationale: string;
    successProbability: number;
}
export interface MatchedPattern {
    id: string;
    type: string;
    confidence: number;
    description: string;
}
export declare class PatternPredictor {
    private ruvFannClient;
    private patternLearner;
    private predictionCache;
    private cacheTimeout;
    constructor(ruvFannClient: RuvFannClient, patternLearner: PatternLearner);
    predict(tool: string, params: any, context: ToolContext): Promise<PredictionResult>;
    private synthesizePrediction;
    private calculateConfidence;
    private generateWarnings;
    private buildExplanation;
    private estimateDuration;
    private extractMatchedPatterns;
    generateAlternatives(tool: string, params: any, goal?: string): Promise<Suggestion[]>;
    predictNextTool(recentTools: string[]): Promise<any>;
    getStatistics(): Promise<any>;
    private getCacheKey;
    private toolToIndex;
    private indexToTool;
}
//# sourceMappingURL=pattern-predictor.d.ts.map