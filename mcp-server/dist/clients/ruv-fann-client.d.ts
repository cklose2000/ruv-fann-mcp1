export interface RuvFannConfig {
    coreUrl: string;
    swarmUrl: string;
    modelUrl: string;
}
export interface AgentSpawnRequest {
    agentType: "pattern_matcher" | "outcome_predictor" | "alternative_gen" | "context_analyzer";
    taskData: any;
}
export interface PredictionRequest {
    inputs: number[][];
    context?: any;
}
export interface SwarmAnalysis {
    agentId: string;
    agentType: string;
    analysis: any;
    confidence: number;
    duration: number;
}
export declare class RuvFannClient {
    private config;
    private coreClient;
    private swarmClient;
    private modelClient;
    constructor(config: RuvFannConfig);
    testConnectivity(): Promise<void>;
    spawnPatternAnalysisAgents(tool: string, params: any, context: any): Promise<SwarmAnalysis[]>;
    predict(inputs: number[][], context?: any): Promise<any>;
    trainPattern(inputs: number[][], targets: number[][], epochs?: number): Promise<void>;
    forecast(values: number[], horizon?: number): Promise<any>;
    predictPattern(tool: string, params: any, patterns: any[], context?: any): Promise<{
        successProbability: number;
        confidence: number;
    }>;
    private patternsToInputs;
    private hashString;
}
//# sourceMappingURL=ruv-fann-client.d.ts.map