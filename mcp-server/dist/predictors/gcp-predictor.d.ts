import { RuvFannClient } from '../clients/ruv-fann-client.js';
import { GCPPatternStorage } from '../storage/gcp-pattern-storage.js';
export interface GCPPrediction {
    successProbability: number;
    confidence: number;
    estimatedDuration?: number;
    estimatedCost?: number;
    warnings: GCPWarning[];
    suggestions: GCPSuggestion[];
    explanation: string;
}
export interface GCPWarning {
    level: 'low' | 'medium' | 'high' | 'critical';
    message: string;
    reason: string;
    preventable: boolean;
}
export interface GCPSuggestion {
    type: 'optimization' | 'alternative' | 'safety' | 'cost_reduction';
    description: string;
    implementation?: {
        tool: string;
        params: any;
    };
    benefitDescription: string;
}
export declare class GCPPredictor {
    private ruvFannClient;
    private patternStorage;
    private logger;
    constructor(ruvFannClient: RuvFannClient, patternStorage: GCPPatternStorage);
    predictGCPOperation(tool: string, params: any, context?: any): Promise<GCPPrediction>;
    private analyzePatterns;
    private analyzeCosts;
    private analyzeBigQueryCosts;
    private categorizeQuery;
    private analyzeAuthStatus;
    private analyzeRisks;
    private getNeuralPrediction;
    private combinePredictions;
    private generateSuggestions;
    private generateExplanation;
    private sanitizeParams;
}
//# sourceMappingURL=gcp-predictor.d.ts.map