export interface MCPTool {
    name: string;
    description: string;
    inputSchema: {
        type: string;
        properties: Record<string, any>;
        required?: string[];
    };
}
export declare const GCP_TOOLS: MCPTool[];
export declare const BIGQUERY_TOOLS: MCPTool[];
export declare const STORAGE_TOOLS: MCPTool[];
export declare const COMPUTE_TOOLS: MCPTool[];
export declare const CLOUD_RUN_TOOLS: MCPTool[];
export declare const PROJECT_TOOLS: MCPTool[];
export declare function isGCPTool(toolName: string): boolean;
export declare function getGCPTool(toolName: string): MCPTool | undefined;
export declare function convertToolNameForBackend(toolName: string): string;
export declare function convertToolNameFromBackend(toolName: string): string;
export declare const GCP_TOOL_COUNT: number;
//# sourceMappingURL=gcp-tools.d.ts.map